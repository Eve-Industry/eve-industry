# Production image: nginx + PHP-FPM, Horizon, scheduler and one-off tasks in one
# image, selected by APP_ROLE (see docker/start.sh). Runs as www-data.

# Build the React app (frontend/ -> public/app).
FROM node:22-alpine AS frontend
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY docs/openapi.json /build/docs/openapi.json
COPY frontend/ ./
RUN npm run build

FROM php:8.5-fpm-bookworm

# Install system dependencies and nginx
RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    curl \
    procps \
    libbz2-dev \
    libpng-dev \
    libonig-dev \
    libxml2-dev \
    libzip-dev \
    libicu-dev \
    zip \
    unzip \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# PHP extensions
RUN docker-php-ext-configure intl \
    && docker-php-ext-install \
    pdo_mysql \
    mbstring \
    exif \
    pcntl \
    bcmath \
    bz2 \
    gd \
    zip \
    intl \
    opcache

# Redis extension
RUN pecl install redis && docker-php-ext-enable redis

# PHP runtime configuration (memory limits, upload sizes) and OPcache tuning
COPY docker/php.ini /usr/local/etc/php/conf.d/zz-app.ini
COPY docker/opcache.ini /usr/local/etc/php/conf.d/zz-opcache.ini

# Get Composer
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

# Copy application files
COPY . /var/www/html

# Built React app (public/app is not in git)
COPY --from=frontend /build/public/app /var/www/html/public/app

# Install PHP dependencies
RUN composer install --no-dev --optimize-autoloader --no-interaction --prefer-dist

# Writable paths for the unprivileged user. storage/ is a volume in compose.
RUN mkdir -p storage/app/public storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
    && rm -f public/storage && ln -s ../storage/app/public public/storage \
    && chown -R www-data:www-data storage bootstrap/cache

# Nginx: own main config (non-root paths, logs to stdout) plus the site
RUN rm -f /etc/nginx/sites-enabled/default /etc/nginx/conf.d/default.conf
COPY docker/nginx/nginx.conf /etc/nginx/nginx.conf
COPY docker/nginx/default.app.conf /etc/nginx/sites-enabled/default.conf

# Scripts
COPY docker/start.sh /start.sh
COPY docker/healthcheck.sh /healthcheck.sh
RUN chmod +x /start.sh /healthcheck.sh && mkdir -p /tmp/nginx && chown -R www-data:www-data /tmp/nginx

USER www-data

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 CMD ["/healthcheck.sh"]

# Run both php-fpm and nginx (web role) or the role chosen by APP_ROLE
CMD ["/start.sh"]
