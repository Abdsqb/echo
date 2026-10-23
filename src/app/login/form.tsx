"use client";

import { useActionState } from "react";
import { login } from "../actions";
import { SubmitButton } from "@/components/client";

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(login, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input id="password" name="password" type="password" className="input" autoFocus required />
      </div>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <SubmitButton className="btn-primary w-full justify-center" pendingText="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
