import { defineMiddleware } from 'astro:middleware';

const PUBLIC_PATHS = ['/login', '/api/login'];

export const onRequest = defineMiddleware((context, next) => {
  const { pathname } = context.url;

  // Allow public paths through
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p))) {
    return next();
  }

  // Check auth cookie
  const authCookie = context.cookies.get('auth');
  if (authCookie?.value !== 'true') {
    return context.redirect('/login');
  }

  return next();
});
