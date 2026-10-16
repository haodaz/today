# 线上 demo（Railway）。只跑伴随服务端：手机页 /app、电视网页版 /tv、并排的 /demo。
# Fire TV 的 APK 不在这里——它在 GitHub Release 里。
FROM node:22-slim
WORKDIR /app/Today

# 服务端只依赖一个包（Bedrock SDK，静态引入的）。不装整个 Expo。
RUN npm init -y >/dev/null && npm install --no-audit --no-fund @aws-sdk/client-bedrock-runtime@3

COPY Today/server ./server
COPY Today/src ./src
COPY Today/scripts/demo-seed.mjs ./scripts/demo-seed.mjs
COPY Today/assets/today ./assets/today
COPY doc/site /app/doc/site

# 每个访客一个家、每天限额——见 server/index.mjs 里 DEMO 那一段
ENV DEMO=1 DEMO_DIR=/tmp/today-houses NODE_ENV=production
CMD ["node", "server/index.mjs"]
