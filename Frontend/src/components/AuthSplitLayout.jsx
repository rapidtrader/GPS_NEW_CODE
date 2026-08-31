import { useState } from 'react';
import { Link } from 'react-router-dom';
import { TruckIcon } from './Icons';

const GREEN_DARK = '#0f4d3c';
const GREEN_MID = '#1a7a5e';
const GREEN_LIGHT = '#2d9b78';
const MINT = '#d8f0ea';

function BrandLogo({ light = false }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`flex h-16 w-16 items-center justify-center rounded-full shadow-lg ${
          light ? 'bg-white/15 ring-2 ring-white/30' : 'bg-white shadow-emerald-900/20'
        }`}
      >
        <TruckIcon
          className={`h-8 w-8 ${light ? 'text-white' : 'text-emerald-700'}`}
          strokeWidth={2}
        />
      </div>
      <span className={`text-sm font-semibold tracking-wide ${light ? 'text-white' : 'text-emerald-800'}`}>
        GPS Tracking
      </span>
    </div>
  );
}

function WelcomePanel({ onSignIn, showSignInButton }) {
  return (
    <div
      className="relative flex h-full min-h-dvh w-full flex-col items-center justify-center overflow-hidden px-8 py-12 text-center text-white lg:min-h-screen lg:items-start lg:px-14 lg:py-16 lg:text-left xl:px-20"
      style={{
        background: `linear-gradient(145deg, ${GREEN_DARK} 0%, ${GREEN_MID} 45%, ${GREEN_LIGHT} 100%)`,
      }}
    >
      <div className="pointer-events-none absolute -left-16 top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-10 right-0 h-72 w-72 rounded-full bg-emerald-300/20 blur-3xl" />
      <div className="pointer-events-none absolute right-8 top-1/3 h-24 w-24 rounded-full bg-white/10" />

      <div className="relative z-10 flex w-full max-w-md flex-col items-center lg:items-start">
        <BrandLogo light />

        <h1 className="mt-10 text-3xl font-bold leading-tight sm:text-4xl lg:mt-12 lg:text-[2.6rem]">
          Welcome Back!
        </h1>
        <p className="mt-4 max-w-sm text-sm leading-relaxed text-emerald-50/90 sm:text-base">
          To stay connected with your fleet, please login with your personal credentials.
        </p>

        {showSignInButton && (
          <button
            type="button"
            onClick={onSignIn}
            className="mt-10 rounded-full border-2 border-white px-10 py-2.5 text-sm font-bold uppercase tracking-wider text-white transition hover:bg-white/10 lg:hidden"
          >
            Sign In
          </button>
        )}

        <p className="mt-auto hidden pt-16 text-[0.65rem] uppercase tracking-[0.2em] text-emerald-100/70 lg:block">
          Findpath Fleet · GPS Monitoring
        </p>
      </div>

      <div
        className="pointer-events-none absolute -right-12 bottom-0 top-0 hidden w-24 lg:block"
        style={{
          background: 'radial-gradient(ellipse at left center, transparent 68%, white 69%)',
        }}
      />
    </div>
  );
}

function FormPanel({ title, subtitle, children, footer, onBack, mobileForm = false }) {
  return (
    <div
      className={`relative flex w-full flex-col bg-white ${
        mobileForm
          ? 'min-h-0 flex-1 rounded-t-[2.75rem] shadow-[0_-8px_40px_rgba(0,0,0,0.08)]'
          : 'min-h-dvh lg:min-h-screen'
      }`}
    >
      <div
        className="pointer-events-none absolute -right-20 -top-20 hidden h-56 w-56 rounded-full opacity-90 lg:block"
        style={{ background: `linear-gradient(135deg, ${GREEN_MID}, ${GREEN_LIGHT})` }}
      />

      <div className="relative z-10 flex flex-1 flex-col justify-center px-8 py-10 sm:px-12 lg:px-16 xl:px-24">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mb-4 flex items-center gap-1 text-sm font-medium text-emerald-700 lg:hidden"
          >
            ← Back
          </button>
        )}

        <div className="mx-auto w-full max-w-md">
          <h2
            className="text-4xl font-light lowercase tracking-tight sm:text-5xl"
            style={{ color: GREEN_MID }}
          >
            {title}
          </h2>
          <p className="mt-2 text-sm text-gray-500 sm:text-base">{subtitle}</p>
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-gray-500">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

export default function AuthSplitLayout({
  title = 'welcome',
  subtitle,
  children,
  footer,
  signupLink,
}) {
  const [showFormMobile, setShowFormMobile] = useState(false);

  const footerContent =
    footer ||
    (signupLink && (
      <p>
        Don&apos;t have an account?{' '}
        <Link to={signupLink.to} className="font-semibold text-emerald-600 hover:text-emerald-700">
          {signupLink.label}
        </Link>
      </p>
    ));

  /* Mobile — welcome screen (full green) */
  if (!showFormMobile) {
    return (
      <div className="fixed inset-0 z-50 flex h-dvh w-full flex-col overflow-hidden lg:static lg:z-auto lg:h-auto lg:min-h-dvh lg:flex-row">
        <div className="flex h-full w-full flex-1 lg:h-auto lg:w-[44%] lg:flex-none">
          <WelcomePanel
            onSignIn={() => setShowFormMobile(true)}
            showSignInButton
          />
        </div>

        {/* Desktop form — hidden on mobile */}
        <div className="hidden w-full flex-1 lg:flex">
          <FormPanel title={title} subtitle={subtitle} footer={footerContent}>
            {children}
          </FormPanel>
        </div>
      </div>
    );
  }

  /* Mobile — login form */
  return (
    <div className="fixed inset-0 z-50 flex h-dvh w-full flex-col overflow-hidden lg:static lg:z-auto lg:h-auto lg:min-h-dvh lg:flex-row">
      <div
        className="flex shrink-0 items-center justify-center py-8 lg:hidden"
        style={{ background: `linear-gradient(135deg, ${GREEN_DARK}, ${GREEN_MID})` }}
      >
        <BrandLogo light />
      </div>

      <div className="hidden w-full lg:flex lg:w-[44%]">
        <WelcomePanel onSignIn={() => {}} showSignInButton={false} />
      </div>

      <div className="flex min-h-0 w-full flex-1 flex-col lg:flex-1">
        <FormPanel
          title={title}
          subtitle={subtitle}
          footer={footerContent}
          mobileForm
          onBack={() => setShowFormMobile(false)}
        >
          {children}
        </FormPanel>
      </div>
    </div>
  );
}

export const authInputClass =
  'w-full rounded-2xl border-0 px-5 py-3.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/60';

export const authInputStyle = { backgroundColor: MINT };

export const authButtonClass =
  'mt-2 w-full rounded-full py-3.5 text-sm font-bold uppercase tracking-wider text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60';

export const authButtonStyle = {
  background: `linear-gradient(135deg, ${GREEN_MID}, ${GREEN_LIGHT})`,
};
