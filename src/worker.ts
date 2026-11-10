interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  EMAIL: {
    send(message: {
      to: string;
      from: string | { email: string; name: string };
      replyTo: string;
      subject: string;
      text: string;
    }): Promise<{ messageId: string }>;
  };
  CONTACT_LIMIT: { limit(options: { key: string }): Promise<{ success: boolean }> };
  CONTACT_FROM: string;
  CONTACT_TO: string;
}

const MAX_BODY_BYTES = 64 * 1024;
const MAX_NAME = 100;
const MAX_EMAIL = 254;
const MAX_MESSAGE = 5000;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ERRORS: Record<number, string> = {
  400: 'Please check your name, email and message.',
  403: 'Forbidden.',
  405: 'Use POST.',
  413: 'That message is too long.',
  429: 'Too many messages. Try again in a minute.',
  502: "That didn't go through. Try again in a minute.",
};

function reply(request: Request, status: number): Response {
  const wantsJson = request.headers.get('accept')?.includes('application/json');
  if (wantsJson) {
    return Response.json({ ok: status === 200 }, { status, headers: { 'cache-control': 'no-store' } });
  }
  if (status === 200) {
    // The form still works without JavaScript.
    return new Response(null, { status: 303, headers: { location: '/sent' } });
  }
  return new Response(ERRORS[status], { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  return !origin || new URL(origin).host === new URL(request.url).host;
}

async function handleContact(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return reply(request, 405);
  if (!isSameOrigin(request)) return reply(request, 403);
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return reply(request, 413);

  const { success } = await env.CONTACT_LIMIT.limit({ key: request.headers.get('cf-connecting-ip') ?? 'unknown' });
  if (!success) return reply(request, 429);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reply(request, 400);
  }
  const read = (key: string) => {
    const value = form.get(key);
    return typeof value === 'string' ? value.trim() : '';
  };

  // Only bots fill the hidden field. Tell them it worked.
  if (read('website')) return reply(request, 200);

  const name = read('name');
  const email = read('email');
  // Browsers submit line breaks as CRLF but count them as one character for maxlength.
  const message = read('message').replaceAll('\r\n', '\n');
  const valid =
    name.length > 0 &&
    name.length <= MAX_NAME &&
    !/[\r\n]/.test(name) &&
    email.length <= MAX_EMAIL &&
    EMAIL_SHAPE.test(email) &&
    message.length > 0 &&
    message.length <= MAX_MESSAGE;
  if (!valid) return reply(request, 400);

  try {
    await env.EMAIL.send({
      to: env.CONTACT_TO,
      from: { email: env.CONTACT_FROM, name: 'b64labs contact form' },
      replyTo: email,
      subject: `b64labs: message from ${name}`,
      text: `${name} <${email}> wrote:\n\n${message}\n`,
    });
  } catch (error) {
    console.error('Contact email failed', error);
    return reply(request, 502);
  }
  return reply(request, 200);
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    return pathname === '/api/contact' ? handleContact(request, env) : env.ASSETS.fetch(request);
  },
};
