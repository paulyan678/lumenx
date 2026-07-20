import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';
const isDocker = process.env.DOCKER_BUILD === 'true';
const frontendRoot = path.dirname(fileURLToPath(import.meta.url));

function resolveBuildCommit() {
    const explicitCommit = process.env.NEXT_PUBLIC_BUILD_COMMIT || process.env.GITHUB_SHA;
    if (explicitCommit?.trim()) return explicitCommit.trim();
    try {
        return execFileSync(
            'git',
            ['-C', path.resolve(frontendRoot, '..'), 'rev-parse', 'HEAD'],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
        ).trim();
    } catch {
        return '';
    }
}

const buildCommit = resolveBuildCommit();

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:17177';

const nextConfig = {
    env: {
        NEXT_PUBLIC_BUILD_COMMIT: buildCommit,
    },
    output: isProd ? 'export' : undefined,
    distDir: isProd ? 'out' : undefined,
    basePath: isProd && !isDocker ? '/static' : undefined,
    assetPrefix: isProd && !isDocker ? '/static' : undefined,
    // The repo launcher intentionally opens the loopback IP. Trust that host
    // so Next's development client can hydrate instead of serving inert HTML.
    allowedDevOrigins: ['127.0.0.1'],
    // Dev-only: proxy /api-proxy/* to backend to avoid CORS issues (e.g. file downloads).
    // Static exports cannot contain rewrites, so omit the option entirely in production.
    ...(!isProd ? {
        async rewrites() {
            return [
                {
                    source: '/api-proxy/:path*',
                    destination: `${BACKEND_URL}/:path*`,
                },
            ];
        },
    } : {}),
    turbopack: {
        root: frontendRoot,
    },
    images: {
        unoptimized: true,
        remotePatterns: [
            {
                protocol: "https",
                hostname: "placehold.co",
            },
            {
                protocol: "http",
                hostname: "localhost",
                port: "17177",
            },
        ],
    },
};

export default nextConfig;
