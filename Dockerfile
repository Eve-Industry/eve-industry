FROM php:8.3-fpm

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    libbz2-dev \
    libpng-dev \
    libonig-dev \
    libxml2-dev \
    libzip-dev \
    libicu-dev \
    zip \
    unzip \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install PHP extensions
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

# Install Redis extension
RUN pecl install redis && docker-php-ext-enable redis

# PHP runtime configuration (memory limits, upload sizes) and OPcache tuning
COPY docker/php.ini /usr/local/etc/php/conf.d/zz-app.ini
COPY docker/opcache.ini /usr/local/etc/php/conf.d/zz-opcache.ini

# Get Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Create user
RUN useradd -G www-data,root -u 1000 -d /home/dev dev || true
RUN mkdir -p /home/dev/.composer && chown -R dev:dev /home/dev

WORKDIR /var/www

USER dev

# The source is bind-mounted by docker-compose, so nothing is copied in at
# build time. Run `composer install` and `php artisan migrate` inside the
# app container after it starts (see README).

EXPOSE 9000
CMD ["php-fpm"]
