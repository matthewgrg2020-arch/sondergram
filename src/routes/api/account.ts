import { createFileRoute } from "@tanstack/react-router";
import { accountCookie, clearAccountCookie, readAccountCookie, signInAccount, signUpAccount } from "@/lib/auth/app-login.server";

function cookieValue(request: Request) {
  return request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith("sg_account="))?.slice("sg_account=".length) ?? null;
}

export const Route = createFileRoute("/api/account")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const account = readAccountCookie(cookieValue(request));
        return Response.json(account ? { userId: account.userId, email: account.email } : { userId: null, email: null });
      },
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { mode?: string; email?: string; password?: string };
          if (body.mode === "out") {
            return new Response(JSON.stringify({ email: null }), {
              status: 200,
              headers: { "content-type": "application/json", "set-cookie": clearAccountCookie() },
            });
          }
          const email = (body.email || "").trim().toLowerCase();
          const password = body.password || "";
          if (!email.includes("@") || password.length < 8) {
            return Response.json({ message: "Use a real email and a password of at least 8 characters." }, { status: 400 });
          }
          const account = body.mode === "in" ? await signInAccount(email, password) : await signUpAccount(email, password);
          return new Response(JSON.stringify({ email: account.email }), {
            status: 200,
            headers: { "content-type": "application/json", "set-cookie": accountCookie(account) },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not sign in.";
          return Response.json({ message }, { status: 400 });
        }
      },
    },
  },
});
