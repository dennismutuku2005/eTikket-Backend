CREATE DATABASE IF NOT EXISTS etikket CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE etikket;

CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL,
  phone VARCHAR(30) NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','organizer','gate_staff','buyer') NOT NULL DEFAULT 'buyer',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  INDEX idx_users_role (role)
) ENGINE=InnoDB;

CREATE TABLE organizers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  organization_name VARCHAR(150) NULL,
  contact_name VARCHAR(150) NULL,
  phone VARCHAR(30) NULL,
  email VARCHAR(190) NULL,
  mpesa_paybill VARCHAR(50) NULL,
  mpesa_till VARCHAR(50) NULL,
  mpesa_account_name VARCHAR(150) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_organizers_user (user_id),
  CONSTRAINT fk_organizers_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organizer_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  description TEXT NULL,
  category VARCHAR(100) NOT NULL,
  event_date DATE NOT NULL,
  event_time TIME NULL,
  venue VARCHAR(255) NOT NULL,
  host_name VARCHAR(150) NULL,
  price_label VARCHAR(100) NULL,
  status ENUM('draft','live','selling_fast','new','vip_available','sold_out') NOT NULL DEFAULT 'draft',
  cover_image_url VARCHAR(500) NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_events_slug (slug),
  INDEX idx_events_organizer (organizer_id),
  INDEX idx_events_status (status),
  CONSTRAINT fk_events_organizer FOREIGN KEY (organizer_id) REFERENCES organizers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE event_ticket_types (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  available_quantity INT UNSIGNED NOT NULL DEFAULT 100,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_ticket_types_event (event_id),
  CONSTRAINT fk_ticket_types_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE staff_members (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organizer_id BIGINT UNSIGNED NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('gate_admin','support_staff','ticket_scanner','organizer_admin') NOT NULL DEFAULT 'gate_admin',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_staff_email (email),
  INDEX idx_staff_organizer (organizer_id),
  CONSTRAINT fk_staff_organizer FOREIGN KEY (organizer_id) REFERENCES organizers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE event_staff (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id BIGINT UNSIGNED NOT NULL,
  staff_id BIGINT UNSIGNED NOT NULL,
  permission_level VARCHAR(50) NOT NULL DEFAULT 'scanner',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_event_staff (event_id, staff_id),
  CONSTRAINT fk_event_staff_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT fk_event_staff_member FOREIGN KEY (staff_id) REFERENCES staff_members(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id BIGINT UNSIGNED NOT NULL,
  buyer_name VARCHAR(150) NOT NULL,
  buyer_email VARCHAR(190) NOT NULL,
  buyer_phone VARCHAR(30) NOT NULL,
  order_number VARCHAR(50) NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  currency CHAR(3) NOT NULL DEFAULT 'KES',
  status ENUM('pending','paid','cancelled','refunded') NOT NULL DEFAULT 'pending',
  accepted_terms TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_orders_number (order_number),
  INDEX idx_orders_event (event_id),
  CONSTRAINT fk_orders_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  ticket_type_id BIGINT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  line_total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_order_items_order (order_id),
  INDEX idx_order_items_ticket_type (ticket_type_id),
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_order_items_ticket_type FOREIGN KEY (ticket_type_id) REFERENCES event_ticket_types(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE tickets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_item_id BIGINT UNSIGNED NOT NULL,
  event_id BIGINT UNSIGNED NOT NULL,
  ticket_code VARCHAR(80) NOT NULL,
  attendee_name VARCHAR(150) NULL,
  ticket_type VARCHAR(100) NOT NULL,
  status ENUM('issued','checked_in','void') NOT NULL DEFAULT 'issued',
  scanned_by BIGINT UNSIGNED NULL,
  scanned_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tickets_code (ticket_code),
  INDEX idx_tickets_event (event_id),
  CONSTRAINT fk_tickets_order_item FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_tickets_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  payment_method VARCHAR(50) NOT NULL DEFAULT 'mpesa',
  provider_reference VARCHAR(120) NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  currency CHAR(3) NOT NULL DEFAULT 'KES',
  status ENUM('pending','processing','paid','failed','refunded') NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_payments_order (order_id),
  CONSTRAINT fk_payments_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE check_ins (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ticket_id BIGINT UNSIGNED NOT NULL,
  staff_id BIGINT UNSIGNED NOT NULL,
  status ENUM('approved','rejected','flagged') NOT NULL DEFAULT 'approved',
  notes VARCHAR(255) NULL,
  scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_check_ins_ticket (ticket_id),
  INDEX idx_check_ins_staff (staff_id),
  CONSTRAINT fk_check_ins_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_check_ins_staff FOREIGN KEY (staff_id) REFERENCES staff_members(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Optional seed example data for local development
INSERT INTO users (name, email, phone, password_hash, role) VALUES
  ('Admin', 'admin@etikket.co.ke', '0711000001', 'admin123', 'admin'),
  ('Organizer', 'organizer@etikket.co.ke', '0711000002', 'organizer123', 'organizer'),
  ('Gate Staff', 'gate@etikket.co.ke', '0711000003', 'gate123', 'gate_staff');

INSERT INTO organizers (user_id, organization_name, contact_name, phone, email) VALUES
  (2, 'eTikket Demo Events', 'Organizer', '0711000002', 'organizer@etikket.co.ke');

-- Migration: if upgrading an existing DB, run:
-- ALTER TABLE events DROP COLUMN remaining_tickets;
-- remaining_tickets is now computed at query time as:
--   GREATEST(0, SUM(event_ticket_types.available_quantity) - COUNT(tickets WHERE status='issued'))
