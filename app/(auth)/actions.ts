"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

// Vercel serves previews and production on different hosts, so the OAuth return
// address has to be built from the request rather than a fixed env value.
// Every host used here must also be listed in Supabase's Redirect URLs.
async function siteOrigin() {
  const headerList = await headers();
  const forwardedHost = headerList.get("x-forwarded-host");
  const host = forwardedHost || headerList.get("host");

  if (!host) {
    return "";
  }

  const protocol = headerList.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

export async function signIn(formData: FormData) {
  const supabase = await createClient();
  const email = getString(formData, "email");
  const password = getString(formData, "password");

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Supabase reports an unconfirmed address in English; explain the next step instead.
    const message =
      error.code === "email_not_confirmed"
        ? "이메일 인증이 아직 완료되지 않았습니다. 가입할 때 받은 확인 메일의 링크를 눌러 주세요."
        : error.message;

    redirect(`/login?message=${encodeURIComponent(message)}`);
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signUp(formData: FormData) {
  const supabase = await createClient();
  const email = getString(formData, "email");
  const password = getString(formData, "password");
  const fullName = getString(formData, "full_name");

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
    },
  });

  if (error) {
    redirect(`/sign-up?message=${encodeURIComponent(error.message)}`);
  }

  // With email confirmation enabled, sign-up returns no session. Sending the user
  // to /dashboard would bounce them straight back to /login with no explanation.
  if (!data.session) {
    redirect(
      `/login?notice=${encodeURIComponent(
        `${email} 주소로 확인 메일을 보냈습니다. 메일의 링크를 눌러 인증을 완료한 뒤 로그인해 주세요.`,
      )}`,
    );
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signInWithGoogle() {
  const supabase = await createClient();
  const origin = await siteOrigin();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`,
    },
  });

  if (error || !data.url) {
    // The provider is configured in Supabase, not here, so the most common
    // failure is that Google sign-in has not been enabled yet.
    const message = error?.message ?? "Google 로그인을 시작하지 못했습니다. 잠시 뒤 다시 시도해 주세요.";
    redirect(`/login?message=${encodeURIComponent(message)}`);
  }

  // Google hosts the consent screen, so this leaves the app entirely.
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
