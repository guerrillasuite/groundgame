FROM alpine:3.19
RUN apk add --no-cache curl
COPY dispatch.sh /app/dispatch.sh
RUN chmod +x /app/dispatch.sh
CMD ["sh", "/app/dispatch.sh"]
