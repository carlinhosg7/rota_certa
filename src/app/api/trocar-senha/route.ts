import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";
import { validarToken } from "@/lib/auth";

/* =========================================================
   POST - TROCA DE SENHA
========================================================= */

export async function POST(req: NextRequest) {
  try {

    /* =====================================================
       1. RECUPERA A SESSÃO
    ===================================================== */

    const token = req.cookies.get("kidy_session")?.value;

    if (!token) {
      return NextResponse.json(
        {
          erro: "Sessão não encontrada. Faça login novamente.",
        },
        {
          status: 401,
        }
      );
    }

    /* =====================================================
       2. VALIDA O TOKEN
    ===================================================== */

    const sessao = await validarToken(token);

    if (!sessao) {
      return NextResponse.json(
        {
          erro: "Sessão inválida ou expirada. Faça login novamente.",
        },
        {
          status: 401,
        }
      );
    }

    /* =====================================================
       3. IDENTIFICA O USUÁRIO DA SESSÃO
    ===================================================== */

    const usuario = String(sessao.usuario || "").trim();

    if (!usuario) {
      return NextResponse.json(
        {
          erro: "Usuário da sessão não identificado.",
        },
        {
          status: 401,
        }
      );
    }

    /* =====================================================
       4. RECEBE A NOVA SENHA
    ===================================================== */

    const body = await req.json();

    const novaSenha = String(
      body?.novaSenha || ""
    );

    if (!novaSenha) {
      return NextResponse.json(
        {
          erro: "Informe a nova senha.",
        },
        {
          status: 400,
        }
      );
    }

    /* =====================================================
       5. REGRAS DA SENHA
    ===================================================== */

    if (novaSenha.length < 6) {
      return NextResponse.json(
        {
          erro: "A senha deve possuir pelo menos 6 caracteres.",
        },
        {
          status: 400,
        }
      );
    }

    if (novaSenha.length > 72) {
      return NextResponse.json(
        {
          erro: "A senha informada é muito longa.",
        },
        {
          status: 400,
        }
      );
    }

    /* =====================================================
       6. CONFIRMA QUE O USUÁRIO EXISTE E ESTÁ ATIVO
    ===================================================== */

    const {
      data: usuarioBanco,
      error: erroUsuario,
    } = await supabase
      .from("usuarios")
      .select(
        "id,usuario,nome,perfil,codigo_representante,ativo,trocar_senha"
      )
      .eq("usuario", usuario)
      .limit(1)
      .maybeSingle();

    if (erroUsuario) {
      console.error(
        "Erro ao consultar usuário:",
        erroUsuario
      );

      return NextResponse.json(
        {
          erro: "Erro ao consultar usuário.",
        },
        {
          status: 500,
        }
      );
    }

    if (!usuarioBanco) {
      return NextResponse.json(
        {
          erro: "Usuário não encontrado.",
        },
        {
          status: 404,
        }
      );
    }

    if (!usuarioBanco.ativo) {
      return NextResponse.json(
        {
          erro: "Usuário inativo.",
        },
        {
          status: 403,
        }
      );
    }

    /* =====================================================
       7. GERA NOVO HASH BCRYPT
    ===================================================== */

    const senhaHash = await bcrypt.hash(
      novaSenha,
      12
    );

    /* =====================================================
       8. ATUALIZA A SENHA
    ===================================================== */

    const { error: erroAtualizacao } =
      await supabase
        .from("usuarios")
        .update({
          senha_hash: senhaHash,
          trocar_senha: false,
          senha_alterada_em:
            new Date().toISOString(),
        })
        .eq("usuario", usuario);

    if (erroAtualizacao) {
      console.error(
        "Erro ao atualizar senha:",
        erroAtualizacao
      );

      return NextResponse.json(
        {
          erro: "Não foi possível atualizar a senha.",
        },
        {
          status: 500,
        }
      );
    }

    /* =====================================================
       9. REGISTRA EVENTO NO LOG
    ===================================================== */

    try {

      const sessionId =
        req.cookies.get("kidy_sid")?.value ||
        null;

      const ua =
        req.headers.get("user-agent") || "";

      const ip =
        (
          req.headers.get(
            "x-forwarded-for"
          ) || ""
        )
          .split(",")[0]
          .trim() || null;

      const u = ua.toLowerCase();

      const navegador =
        u.includes("edg/")
          ? "Edge"
          : u.includes("chrome/")
          ? "Chrome"
          : u.includes("firefox/")
          ? "Firefox"
          : u.includes("safari/")
          ? "Safari"
          : "Outro";

      const sistema =
        u.includes("windows")
          ? "Windows"
          : u.includes("android")
          ? "Android"
          : u.includes("iphone") ||
            u.includes("ipad")
          ? "iOS"
          : u.includes("mac")
          ? "macOS"
          : u.includes("linux")
          ? "Linux"
          : "Outro";

      const dispositivo =
        ["mobile", "android", "iphone"].some(
          (x) => u.includes(x)
        )
          ? "Mobile"
          : "Desktop";

      await supabase
        .from("log_acesso")
        .insert({
          usuario:
            String(usuarioBanco.usuario),
          nome:
            usuarioBanco.nome || null,
          perfil:
            usuarioBanco.perfil || null,
          codigo_representante:
            usuarioBanco.codigo_representante ||
            null,

          ip,

          cidade: null,
          estado: null,
          pais: null,

          latitude: null,
          longitude: null,

          dispositivo,
          navegador,

          sistema_operacional:
            sistema,

          session_id:
            sessionId,

          evento:
            "TROCA_SENHA",
        });

    } catch (erroLog) {
      /*
       * O log não pode impedir a troca
       * da senha.
       */
      console.error(
        "Falha ao registrar TROCA_SENHA:",
        erroLog
      );
    }

    /* =====================================================
       10. SUCESSO
    ===================================================== */

    return NextResponse.json({
      sucesso: true,
      mensagem:
        "Senha alterada com sucesso.",
    });

  } catch (erro) {

    console.error(
      "Erro na troca de senha:",
      erro
    );

    return NextResponse.json(
      {
        erro: "Erro interno ao alterar senha.",
      },
      {
        status: 500,
      }
    );
  }
}