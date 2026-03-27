import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import * as crypto from 'crypto';

import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import type { RequestMetadata } from '@documenso/lib/universal/extract-request-metadata';
import { prisma } from '@documenso/prisma';

import { createSession, generateSessionToken } from '../lib/session/session';
import { setSessionCookie } from '../lib/session/session-cookies';
import type { HonoAuthContext } from '../types/context';

export const erpSsoRoute = new Hono<HonoAuthContext>().get(
  '/',
  zValidator(
    'query',
    z.object({
      token: z.string().min(1),
    }),
  ),
  async (c) => {
    const { token } = c.req.valid('query');
    const secret = process.env.ERP_SSO_SECRET || 'erp-super-secret';
    
    // Manual JWT verification
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new AppError(AppErrorCode.UNAUTHORIZED, { message: 'Invalid token format' });
    }

    const [encodedHeader, encodedPayload, signature] = parts;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(encodedHeader + '.' + encodedPayload)
      .digest('base64url');

    if (signature !== expectedSignature) {
      throw new AppError(AppErrorCode.UNAUTHORIZED, { message: 'Invalid token signature' });
    }

    let payload: { email: string; name: string; tenantId: string; exp?: number; [key: string]: unknown };
    try {
      const payloadString = Buffer.from(encodedPayload, 'base64url').toString('utf8');
      const parsed = JSON.parse(payloadString);
      
      if (!parsed || typeof parsed !== 'object') {
         throw new Error('Not object');
      }
      
      if (typeof parsed.email !== 'string' || typeof parsed.tenantId !== 'string') {
         throw new Error('Missing fields');
      }

      payload = parsed as { email: string; name: string; tenantId: string; exp?: number; [key: string]: unknown };
    } catch (err) {
      throw new AppError(AppErrorCode.UNAUTHORIZED, { message: 'Invalid token payload format' });
    }

    if (payload.exp && Date.now() >= payload.exp * 1000) {
      throw new AppError(AppErrorCode.UNAUTHORIZED, { message: 'Token expired' });
    }

    const email = payload.email;
    const name = payload.name;
    const tenantId = payload.tenantId;

    const reqMetadata = c.get('requestMetadata');
    const metadata: RequestMetadata = reqMetadata || { ipAddress: null, userAgent: null };

    // 1. Find or Create User
    let user = await prisma.user.findFirst({
      where: { email },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: typeof name === 'string' && name ? name : email.split('@')[0],
          emailVerified: new Date(),
          source: 'ERP_SSO',
        },
      });
    }

    // 2. Multi-Tenant Mapping (skipping explicit Documenso Team creation)

    // 3. Create Session
    const tokenStr = generateSessionToken();
    await createSession(tokenStr, user.id, metadata);
    
    // 4. Set Session Cookie
    await setSessionCookie(c, tokenStr);

    // 5. Redirect to tenant documents
    return c.redirect(`/t/${tenantId}/documents`);
  }
);
