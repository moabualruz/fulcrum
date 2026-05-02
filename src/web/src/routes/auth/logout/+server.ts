import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ fetch }) => {
  await fetch("/api/auth/sign-out", {
    method: "POST",
    credentials: "include",
  });

  throw redirect(302, "/auth/login");
};
