require("dotenv").config();

const mysql = require("mysql2/promise");
const { DB_USER, DB_NAME, DB_HOST, DB_PASSWORD, DB_PORT } = process.env;

const db = mysql.createPool({
    host: DB_HOST,
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
    port: DB_PORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = db;