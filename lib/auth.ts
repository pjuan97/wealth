import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

if (!process.env.JWT_SECRET) {
  throw new Error(
    'JWT_SECRET environment variable is required — refusing to start with an insecure default.'
  )
}

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET)

const COOKIE_NAME = 'wealth_session'

export interface SessionUser {
  id: number
  email: string
  name: string
}

export async function createSession(user: SessionUser): Promise<string> {
  const token = await new SignJWT({
    id: user.id,
    email: user.email,
    name: user.name,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(SECRET)
  return token
}

export async function verifySession(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET)
    return {
      id: payload.id as number,
      email: payload.email as string,
      name: payload.name as string,
    }
  } catch {
    return null
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null
  return verifySession(token)
}

export function getSessionFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie') || ''
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`))
  return match ? match[1] : null
}

export async function verifyRequestSession(request: Request): Promise<SessionUser | null> {
  const token = getSessionFromRequest(request)
  if (!token) return null
  return verifySession(token)
}

export const COOKIE_NAME_EXPORT = COOKIE_NAME
