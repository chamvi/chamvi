FROM node:26-trixie-slim

LABEL org.opencontainers.image.source="https://github.com/chamvi/chamvi" \
      org.opencontainers.image.description="chamvi app runtime: Node.js 26, tini, uid 1000" \
      org.opencontainers.image.licenses="Apache-2.0"

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

# the app lives here, owned by root: the process (uid 1000) can read it, not change it
RUN mkdir /app

ENV NODE_ENV=production

# the image's node user, numeric so runAsNonRoot can verify it
USER 1000:1000

WORKDIR /app

ENTRYPOINT ["/usr/bin/tini", "--"]

CMD ["node"]
