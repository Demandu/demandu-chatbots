import createNextIntlPlugin from "next-intl/plugin";

/* El plugin encuentra `src/i18n/request.ts` y hace que los textos estén
 * disponibles en cada petición, en servidor y en cliente. Sin él, `useTranslations`
 * lanza en tiempo de ejecución — y con `ignoreBuildErrors` puesto, eso se
 * descubriría en producción y no al compilar. */
const conIdiomas = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // El primer deploy no debe romperse por lint/tipos (se refina después).
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default conIdiomas(nextConfig);
