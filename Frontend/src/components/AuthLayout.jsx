const inputClass =
  'mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-black placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

const labelClass = 'block text-sm font-medium text-black';

const buttonClass =
  'mt-2 w-full rounded-lg bg-blue-600 py-3 font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60';

export default function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white p-6">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-lg">
        <h1 className="text-2xl font-bold text-black">{title}</h1>
        <p className="mt-2 text-sm text-gray-600">{subtitle}</p>
        {children}
      </div>
    </div>
  );
}

export { inputClass, labelClass, buttonClass };
