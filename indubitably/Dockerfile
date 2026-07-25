FROM node:22.16.0-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY schemas ./schemas
COPY examples ./examples
COPY scripts ./scripts
RUN useradd --create-home --uid 10001 indubitably \
    && mkdir -p /app/data /app/validator-workspaces \
    && chown -R indubitably:indubitably /app
USER indubitably
ENV INDUBITABLY_HOST=0.0.0.0
EXPOSE 8787
CMD ["node", "src/main.mjs"]
