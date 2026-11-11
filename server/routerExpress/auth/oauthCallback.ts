import { prisma } from '../../prisma';
import { getGlobalConfig } from '../../routerTrpc/config';
import { generateToken, generateApiToken } from '../../lib/helper';
import { cache } from '@shared/lib/cache';

const CACHE_TTL = 20 * 1000;

export async function handleOAuthCallback(accessToken: string, refreshToken: string, profile: any, done: any) {
  try {
    let userName = profile.username || profile.displayName || profile.id.toString();

    let existingUser = await prisma.accounts.findFirst({
      where: {
        name: userName,
        loginType: 'oauth'
      }
    });

    if (!existingUser) {
      // Match password registration: the first account may bootstrap the instance.
      if (await prisma.accounts.count() > 0) {
        const registration = await prisma.config.findFirst({ where: { key: 'isAllowRegister' } });
        const setting = registration?.config as { value?: boolean } | null | undefined;
        if (!registration || setting?.value === false) {
          return done(null, false, { message: 'not allow register' });
        }
      }

      const newUser = await prisma.accounts.create({
        data: {
          name: userName,
          nickname: userName,
          image: profile.photos?.[0]?.value || '',
          role: 'user',
          loginType: 'oauth',
        }
      });

      cache.set(`user_by_id_${newUser.id}`, null);

      const token = await generateToken(newUser, false);
      const apiToken = await generateApiToken({ id: newUser.id, name: newUser.name ?? '', role: newUser.role });
      await prisma.accounts.update({
        where: { id: newUser.id },
        data: { apiToken }
      });

      return done(null, { ...newUser, token });
    } else {
      let realUser = existingUser;
      if (existingUser.linkAccountId) {
        realUser = await cache.wrap(`linked_account_${existingUser.linkAccountId}`, async () => {
          return (await prisma.accounts.findFirst({ where: { id: existingUser.linkAccountId! } }))!;
        }, { ttl: CACHE_TTL });
      }

      await prisma.accounts.update({
        where: { id: existingUser.id },
        data: {
          image: profile.photos?.[0]?.value || existingUser.image,
          updatedAt: new Date()
        }
      });

      cache.set(`user_by_id_${existingUser.id}`, null);

      const config = await getGlobalConfig({
        ctx: {
          id: realUser.id.toString(),
          role: realUser.role as 'superadmin' | 'user',
          name: realUser.name,
          sub: realUser.id.toString(),
          exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60 * 1000,
          iat: Math.floor(Date.now() / 1000),
        },
      });

      if (config.twoFactorEnabled) {
        return done(null, false, { requiresTwoFactor: true, userId: realUser.id });
      }

      const token = await generateToken(realUser, false);
      const apiToken = await generateApiToken({ id: realUser.id, name: realUser.name ?? '', role: realUser.role });
      await prisma.accounts.update({
        where: { id: realUser.id },
        data: { apiToken }
      });

      return done(null, { ...realUser, token });
    }
  } catch (error) {
    return done(error);
  }
}
