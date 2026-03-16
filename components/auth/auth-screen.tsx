'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/client';

const loginSchema = z.object({
  email: z.string().trim().email('Geçerli bir e-posta gir'),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalı'),
});

const registerSchema = z.object({
  username: z.string().trim().min(3, 'Kullanıcı adı en az 3 karakter olmalı').max(24, 'Maksimum 24 karakter'),
  email: z.string().trim().email('Geçerli bir e-posta gir'),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalı'),
  confirmPassword: z.string().min(6, 'Şifre tekrarı en az 6 karakter olmalı'),
}).refine((values) => values.password === values.confirmPassword, {
  message: 'Şifreler eşleşmiyor',
  path: ['confirmPassword'],
});

type LoginValues = z.infer<typeof loginSchema>;
type RegisterValues = z.infer<typeof registerSchema>;

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const KNOWN_ACCOUNTS_KEY = 'drifd-known-accounts';
const SWITCH_ACCOUNT_KEY = 'drifd-switch-account-email';

function rememberAccount(email: string, username?: string | null) {
  if (typeof window === 'undefined') return;

  try {
    const raw = window.localStorage.getItem(KNOWN_ACCOUNTS_KEY);
    const current = raw ? JSON.parse(raw) as Array<{ email: string; username?: string | null; lastUsedAt: string }> : [];
    const next = [
      { email, username: username || null, lastUsedAt: new Date().toISOString() },
      ...current.filter((item) => item.email !== email),
    ].slice(0, 10);
    window.localStorage.setItem(KNOWN_ACCOUNTS_KEY, JSON.stringify(next));
    window.localStorage.removeItem(SWITCH_ACCOUNT_KEY);
  } catch {
    // ignore
  }
}

export function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [formError, setFormError] = useState<string | null>(null);
  const [formInfo, setFormInfo] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const supabase = createClient();

  useEffect(() => {
    if (resendCooldown <= 0) return;

    const timer = setInterval(() => {
      setResendCooldown((value) => Math.max(0, value - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [resendCooldown]);

  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const registerForm = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { username: '', email: '', password: '', confirmPassword: '' },
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const switchEmail = window.localStorage.getItem(SWITCH_ACCOUNT_KEY);
    if (!switchEmail) return;

    setMode('login');
    loginForm.setValue('email', switchEmail, { shouldValidate: true });
    setFormInfo(`Hesap değiştiriliyor: ${switchEmail}`);
  }, [loginForm]);

  const mapAuthError = (message: string) => {
    const normalized = message.toLowerCase();
    if (normalized.includes('email not confirmed')) {
      return 'E-posta doğrulanmamış görünüyor. Aşağıdaki butonla doğrulama mailini tekrar gönderebilirsin.';
    }
    if (normalized.includes('invalid login credentials')) {
      return 'E-posta veya şifre hatalı. Bilgileri kontrol et.';
    }
    if (normalized.includes('user already registered')) {
      return 'Bu e-posta zaten kayıtlı. Login sekmesinden giriş yapabilir veya doğrulama mailini tekrar gönderebilirsin.';
    }
    return message;
  };

  const handleLogin = async (values: LoginValues) => {
    const email = normalizeEmail(values.email);

    setFormError(null);
    setFormInfo(null);

    let signedInEventSeen = false;
    const signedInPromise = new Promise<void>((resolve) => {
      const { data } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          signedInEventSeen = true;
          data.subscription.unsubscribe();
          resolve();
        }
      });

      // Safety timeout: don't block the UI forever if the event doesn't fire.
      window.setTimeout(() => {
        if (!signedInEventSeen) {
          data.subscription.unsubscribe();
          resolve();
        }
      }, 750);
    });

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: values.password,
    });

    if (error) {
      setFormError(mapAuthError(error.message));

      if (error.message.toLowerCase().includes('email not confirmed')) {
        setPendingEmail(email);

        const resendResult = await supabase.auth.resend({
          type: 'signup',
          email,
        });

        if (!resendResult.error) {
          setFormInfo('Hesap doğrulanmamış. Doğrulama mailini otomatik tekrar gönderdim. Spam/Junk klasörünü de kontrol et.');
        }
      }

      return;
    }

    const session = data.session ?? (await supabase.auth.getSession()).data.session;

    if (!session) {
      setFormError('Giriş başarılı görünüyor ama oturum oluşturulamadı. Sayfayı yenileyip tekrar dene.');
      return;
    }

    // Set user as online and update last_seen
    if (session.user) {
      await (supabase as any)
        .from('profiles')
        .update({ 
          status: 'online',
          last_seen: new Date().toISOString()
        })
        .eq('id', session.user.id);

      rememberAccount(email, typeof session.user.user_metadata?.username === 'string' ? session.user.user_metadata.username : null);
    }

    // Wait for auth state change event to fire
    await signedInPromise;
    
    // Longer delay to ensure cookies are fully written (especially in Electron)
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Hard navigation to ensure server sees fresh cookies
    window.location.assign('/');
  };

  const handleRegister = async (values: RegisterValues) => {
    const email = normalizeEmail(values.email);

    setFormError(null);
    setFormInfo(null);
    setPendingEmail(null);

    const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;

    const { data, error } = await supabase.auth.signUp({
      email,
      password: values.password,
      options: {
        emailRedirectTo: redirectTo,
        data: {
          username: values.username,
        },
      },
    });

    if (error) {
      setFormError(mapAuthError(error.message));

      if (error.message.toLowerCase().includes('already registered')) {
        setPendingEmail(email);
      }

      return;
    }

    if (!data.session) {
      setPendingEmail(email);
      setResendCooldown(60);
      setFormInfo('Kayıt başarılı. Doğrulama maili gönderildi. Gelmediyse 60 saniye sonra tekrar gönderebilirsin.');
      rememberAccount(email, values.username);

      return;
    }

    rememberAccount(email, values.username);

    // Wait for session to fully sync
    await new Promise(resolve => setTimeout(resolve, 800));
    window.location.assign('/');
  };

  const handleResendConfirmation = async () => {
    if (!pendingEmail || resending || resendCooldown > 0) return;

    setResending(true);
    setFormError(null);
    setFormInfo(null);

    const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: pendingEmail,
      options: {
        emailRedirectTo: redirectTo,
      },
    });

    if (error) {
      const rateLimitMatch = error.message.match(/after\s+(\d+)\s+seconds?/i);
      if (rateLimitMatch?.[1]) {
        const seconds = Number(rateLimitMatch[1]);
        setResendCooldown(Number.isFinite(seconds) ? seconds : 60);
        setFormError(`Çok sık istek atıldı. Lütfen ${seconds} saniye bekleyip tekrar dene.`);
      } else {
        setFormError(
          `Doğrulama maili tekrar gönderilemedi: ${error.message}. Supabase > Auth > Email ayarlarında SMTP ve Confirm email yapılandırmasını kontrol et.`,
        );
      }
      setResending(false);
      return;
    }

    setResendCooldown(60);
    setFormInfo('Doğrulama maili tekrar gönderildi. Spam/Junk klasörünü de kontrol et.');
    setResending(false);
  };

  const handleMagicLink = async (rawEmail: string) => {
    const email = normalizeEmail(rawEmail);

    if (!email) {
      setFormError('Önce email alanını doldur.');
      return;
    }

    setFormError(null);
    setFormInfo(null);

    const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
      },
    });

    if (error) {
      setFormError(`Magic link gönderilemedi: ${error.message}`);
      return;
    }

    setFormInfo('Magic link gönderildi. Mail kutunu ve spam/junk klasörünü kontrol et.');
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-drifd-bg p-4">
      <div className="w-full max-w-md rounded-xl border border-drifd-divider bg-drifd-secondary p-6 shadow-xl">
        <h1 className="mb-1 text-2xl font-bold text-white">Drifd</h1>
        <p className="mb-6 text-sm text-drifd-muted">Giriş yaptıktan sonra 30 gün otomatik erişim açık kalır.</p>

        <div className="mb-4 flex gap-2 rounded-lg bg-drifd-hover p-1 text-sm">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`flex-1 rounded-md px-3 py-2 ${mode === 'login' ? 'bg-drifd-primary text-black' : 'text-drifd-text'}`}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`flex-1 rounded-md px-3 py-2 ${mode === 'register' ? 'bg-drifd-primary text-black' : 'text-drifd-text'}`}
          >
            Register
          </button>
        </div>

        {mode === 'login' ? (
          <form key="login-form" className="space-y-3" onSubmit={loginForm.handleSubmit(handleLogin)}>
            <input
              key="login-email"
              {...loginForm.register('email')}
              placeholder="Email"
              autoComplete="email"
              className="w-full rounded-md border border-drifd-divider bg-drifd-tertiary px-3 py-2 text-sm text-drifd-text outline-none focus:border-drifd-primary"
            />
            {loginForm.formState.errors.email ? <p className="text-xs text-red-400">{loginForm.formState.errors.email.message}</p> : null}

            <input
              key="login-password"
              {...loginForm.register('password')}
              type="password"
              placeholder="Password"
              autoComplete="current-password"
              className="w-full rounded-md border border-drifd-divider bg-drifd-tertiary px-3 py-2 text-sm text-drifd-text outline-none focus:border-drifd-primary"
            />
            {loginForm.formState.errors.password ? <p className="text-xs text-red-400">{loginForm.formState.errors.password.message}</p> : null}

            <button
              type="submit"
              disabled={loginForm.formState.isSubmitting}
              className="w-full rounded-md bg-drifd-primary px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
            >
              {loginForm.formState.isSubmitting ? 'Logging in...' : 'Log in'}
            </button>

            <button
              type="button"
              onClick={() => handleMagicLink(loginForm.getValues('email'))}
              className="w-full rounded-md border border-drifd-divider px-4 py-2 text-sm text-drifd-text hover:bg-drifd-hover"
            >
              Magic link ile giriş
            </button>
          </form>
        ) : (
          <form key="register-form" className="space-y-3" onSubmit={registerForm.handleSubmit(handleRegister)}>
            <input
              key="register-username"
              {...registerForm.register('username')}
              placeholder="Username"
              autoComplete="username"
              className="w-full rounded-md border border-drifd-divider bg-drifd-tertiary px-3 py-2 text-sm text-drifd-text outline-none focus:border-drifd-primary"
            />
            {registerForm.formState.errors.username ? <p className="text-xs text-red-400">{registerForm.formState.errors.username.message}</p> : null}

            <input
              key="register-email"
              {...registerForm.register('email')}
              placeholder="Email"
              autoComplete="email"
              className="w-full rounded-md border border-drifd-divider bg-drifd-tertiary px-3 py-2 text-sm text-drifd-text outline-none focus:border-drifd-primary"
            />
            {registerForm.formState.errors.email ? <p className="text-xs text-red-400">{registerForm.formState.errors.email.message}</p> : null}

            <input
              key="register-password"
              {...registerForm.register('password')}
              type="password"
              placeholder="Password"
              autoComplete="new-password"
              className="w-full rounded-md border border-drifd-divider bg-drifd-tertiary px-3 py-2 text-sm text-drifd-text outline-none focus:border-drifd-primary"
            />
            {registerForm.formState.errors.password ? <p className="text-xs text-red-400">{registerForm.formState.errors.password.message}</p> : null}

            <input
              key="register-confirm-password"
              {...registerForm.register('confirmPassword')}
              type="password"
              placeholder="Confirm Password"
              autoComplete="new-password"
              className="w-full rounded-md border border-drifd-divider bg-drifd-tertiary px-3 py-2 text-sm text-drifd-text outline-none focus:border-drifd-primary"
            />
            {registerForm.formState.errors.confirmPassword ? (
              <p className="text-xs text-red-400">{registerForm.formState.errors.confirmPassword.message}</p>
            ) : null}

            <button
              type="submit"
              disabled={registerForm.formState.isSubmitting}
              className="w-full rounded-md bg-drifd-primary px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
            >
              {registerForm.formState.isSubmitting ? 'Creating account...' : 'Register'}
            </button>

            <button
              type="button"
              onClick={() => handleMagicLink(registerForm.getValues('email'))}
              className="w-full rounded-md border border-drifd-divider px-4 py-2 text-sm text-drifd-text hover:bg-drifd-hover"
            >
              Magic link gönder
            </button>
          </form>
        )}

        {formError ? <p className="mt-3 text-xs text-red-400">{formError}</p> : null}
        {formInfo ? <p className="mt-3 text-xs text-green-400">{formInfo}</p> : null}

        {pendingEmail ? (
          <button
            type="button"
            onClick={handleResendConfirmation}
            disabled={resending || resendCooldown > 0}
            className="mt-3 w-full rounded-md border border-drifd-divider px-4 py-2 text-xs text-drifd-text hover:bg-drifd-hover disabled:opacity-50"
          >
            {resending
              ? 'Tekrar gönderiliyor...'
              : resendCooldown > 0
                ? `Doğrulama maili için bekle: ${resendCooldown}s`
                : `Doğrulama mailini tekrar gönder (${pendingEmail})`}
          </button>
        ) : null}
      </div>
    </main>
  );
}
