import { LoginForm } from "./form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm p-8">
        <div className="stage mb-1">human-in-the-loop · drafts only</div>
        <h1 className="mb-1 text-2xl font-semibold">Echo</h1>
        <p className="mb-6 text-sm text-muted">Zoom transcript → follow-up email draft, in your voice.</p>
        <LoginForm next={next ?? "/"} />
      </div>
    </main>
  );
}
