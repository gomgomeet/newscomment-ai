"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
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

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
