import { describe, expect, test } from 'bun:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Twitter = require('passport-twitter');

const twitterOptions = {
  consumerKey: 'test-consumer',
  consumerSecret: 'test-secret',
  callbackURL: '/api/auth/callback/twitter',
  includeEmail: true,
};

describe('Twitter OAuth1 with the maintained XML parser', () => {
  test('preserves JSON, XML and non-XML error messages', () => {
    const strategy = new Twitter(twitterOptions, () => {});
    for (const [body, message] of [
      ['{"errors":[{"message":"Bad token","code":89}]}', 'Bad token'],
      ['<hash><error>Bad &amp; expired</error></hash>', 'Bad & expired'],
      ['<hash><error>Bad', '<hash><error>Bad'],
      ['Upstream unavailable', 'Upstream unavailable'],
    ]) {
      const error = strategy._createOAuthError('Request token failed', { statusCode: 401, data: body });
      expect(error.message).toBe(message);
    }
    expect(strategy._createOAuthError('Request token failed', { statusCode: 401, data: '' }).message)
      .toBe('Request token failed');
  });

  test('retains request-token secrets, verifier and the existing profile callback', async () => {
    const profile = {
      id_str: '42', screen_name: 'alice', name: 'Alice',
      email: 'alice@example.invalid', profile_image_url_https: 'https://example.invalid/avatar.png',
    };
    const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const strategy = new Twitter(twitterOptions, (token, secret, user, done) => {
        expect([token, secret]).toEqual(['access-token', 'access-secret']);
        done(null, user);
      });
      strategy._oauth.getOAuthRequestToken = (params, callback) => {
        expect(params.oauth_callback).toBe('https://app.invalid/api/auth/callback/twitter');
        callback(null, 'request-token', 'request-secret', { oauth_callback_confirmed: 'true' });
      };
      strategy._oauth.getOAuthAccessToken = (token, secret, verifier, callback) => {
        expect([token, secret, verifier]).toEqual(['request-token', 'request-secret', 'verified']);
        callback(null, 'access-token', 'access-secret', { user_id: '42', screen_name: 'alice' });
      };
      strategy._oauth.get = (url, token, secret, callback) => {
        expect(new URL(url).searchParams.get('include_email')).toBe('true');
        expect([token, secret]).toEqual(['access-token', 'access-secret']);
        callback(null, JSON.stringify(profile), { headers: { 'x-access-level': 'read' } });
      };
      const request = {
        headers: { host: 'app.invalid' }, connection: { encrypted: true },
        url: '/api/auth/login/twitter', session: {}, query: {},
      };
      strategy.error = reject;
      strategy.fail = () => reject(new Error('Unexpected OAuth failure'));
      strategy.success = resolve;
      strategy.redirect = url => {
        expect(url).toBe('https://api.twitter.com/oauth/authenticate?oauth_token=request-token');
        strategy.authenticate({
          ...request, url: '/api/auth/callback/twitter',
          query: { oauth_token: 'request-token', oauth_verifier: 'verified' },
        }, {});
      };
      strategy.authenticate(request, {});
    });
    expect(result).toMatchObject({ id: '42', username: 'alice', provider: 'twitter' });
    expect(result.emails).toEqual([{ value: 'alice@example.invalid' }]);
  });
});
