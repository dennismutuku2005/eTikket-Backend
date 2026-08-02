# eTikket Backend

This backend starter uses Node.js + Express + MySQL for the eTikket ticketing platform.

## Setup

1. Install dependencies:
   npm install express cors mysql2

2. Create the MySQL database and import the schema:
   mysql -u root -p < database/database.sql

3. Start the server:
   node server.js

## Notes

- The schema covers users, organizers, events, ticket types, staff, orders, order items, tickets, payments, and check-ins.
- The server exposes a simple health endpoint and an events listing endpoint.
