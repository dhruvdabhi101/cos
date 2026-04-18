import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: don't run code between createServerClient and getUser — refresh race.
  const { data: { user } } = await supabase.auth.getUser();

  const url = request.nextUrl;
  const isAuthRoute = url.pathname.startsWith("/login") || url.pathname.startsWith("/auth");
  const isPublicAsset =
    url.pathname.startsWith("/_next") ||
    url.pathname.startsWith("/icons") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/sw.js" ||
    url.pathname === "/favicon.ico";

  if (!user && !isAuthRoute && !isPublicAsset) {
    const loginUrl = url.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", url.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && url.pathname === "/login") {
    const homeUrl = url.clone();
    homeUrl.pathname = "/";
    return NextResponse.redirect(homeUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|sw.js).*)"],
};
