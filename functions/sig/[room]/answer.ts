interface Env {
  SIGNAL_R2: R2Bucket;
}

const TTL_SECONDS = 60 * 60 * 24;

export const onRequest: PagesFunction<Env> = async ({ request, params, env }) => {
  const roomId = (params.room as string | undefined)?.trim();
  if (!roomId) {
    return new Response('Missing room id', { status: 400 });
  }
  const objectKey = `answer/${roomId}`;

  switch (request.method.toUpperCase()) {
    case 'PUT': {
      const body = await request.text();
      if (!body) {
        return new Response('Answer body is empty', { status: 400 });
      }
      await env.SIGNAL_R2.put(objectKey, body, {
        httpMetadata: { contentType: 'application/json' },
        customMetadata: { expiry: String(Date.now() + TTL_SECONDS * 1000) },
      });
      return new Response(null, { status: 204 });
    }
    case 'DELETE': {
      const object = await env.SIGNAL_R2.get(objectKey);
      if (!object) {
        await env.SIGNAL_R2.delete(objectKey);
        return new Response(null, { status: 204 });
      }
      const body = await object.text();
      await env.SIGNAL_R2.delete(objectKey);
      return new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    default:
      return new Response('Method not allowed', {
        status: 405,
        headers: { Allow: 'PUT, DELETE' },
      });
  }
};
