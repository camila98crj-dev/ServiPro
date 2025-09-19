const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();
const PORT = 3000;

// Middlewares
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(
  session({
    secret: "supersecreto",
    resave: false,
    saveUninitialized: true,
  })
);

// Base de datos
const db = new sqlite3.Database("./database.sqlite", (err) => {
  if (err) console.error(err.message);
  else console.log("Conectado a SQLite");
});

// Tablas
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT UNIQUE,
    password TEXT,
    role TEXT CHECK(role IN ('cliente','profesional'))
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS reservas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER,
    profesional_id INTEGER,
    fecha TEXT,
    FOREIGN KEY(cliente_id) REFERENCES users(id),
    FOREIGN KEY(profesional_id) REFERENCES users(id)
  )
`);

// Página principal
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// Registro
app.post("/usuario-register", async (req, res) => {
  const { name, email, password, role } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  db.run(
    "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)",
    [name, email, hashedPassword, role],
    function (err) {
      if (err) {
        console.error(err.message);
        res.send("Error: este correo ya está registrado.");
      } else {
        res.send("Registro exitoso. <a href='/'>Inicia sesión</a>");
      }
    }
  );
});

// Login
app.post("/usuario-login", (req, res) => {
  const { email, password } = req.body;

  db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
    if (err) return res.send("Error en la base de datos.");
    if (!user) return res.send("Usuario no encontrado.");

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.send("Contraseña incorrecta.");

    req.session.user = user;
    res.redirect("/dashboard");
  });
});

// Dashboard
app.get("/dashboard", (req, res) => {
  if (!req.session.user) return res.redirect("/");

  const user = req.session.user;

  if (user.role === "cliente") {
    // Panel de clientes
    db.all("SELECT * FROM users WHERE role = 'profesional'", [], (err, profesionales) => {
      if (err) return res.send("Error cargando profesionales.");

      let listaProfesionales = profesionales
        .map(
          (p) => `
          <option value="${p.id}">${p.name}</option>
        `
        )
        .join("");

      res.send(`
        <h1>Bienvenido, ${user.name} (Cliente)</h1>
        <h2>Reservar cita</h2>
        <form method="POST" action="/reservar">
          <label>Selecciona profesional:</label>
          <select name="profesional_id">${listaProfesionales}</select><br>
          <label>Fecha:</label>
          <input type="date" name="fecha" required><br>
          <button type="submit">Reservar</button>
        </form>
        <a href="/logout">Cerrar sesión</a>
      `);
    });
  } else {
    // Panel de profesionales
    db.all(
      "SELECT r.id, r.fecha, u.name as cliente FROM reservas r JOIN users u ON r.cliente_id = u.id WHERE profesional_id = ?",
      [user.id],
      (err, reservas) => {
        if (err) return res.send("Error cargando reservas.");

        let lista = reservas
          .map((r) => `<li>${r.fecha} - Cliente: ${r.cliente}</li>`)
          .join("");

        res.send(`
          <h1>Bienvenido, ${user.name} (Profesional)</h1>
          <h2>Mis reservas</h2>
          <ul>${lista || "Aún no tienes reservas."}</ul>
          <a href="/logout">Cerrar sesión</a>
        `);
      }
    );
  }
});

// Guardar reservas
app.post("/reservar", (req, res) => {
  if (!req.session.user || req.session.user.role !== "cliente")
    return res.send("No autorizado.");

  const { profesional_id, fecha } = req.body;
  const cliente_id = req.session.user.id;

  db.run(
    "INSERT INTO reservas (cliente_id, profesional_id, fecha) VALUES (?, ?, ?)",
    [cliente_id, profesional_id, fecha],
    function (err) {
      if (err) {
        console.error(err.message);
        res.send("Error al guardar reserva.");
      } else {
        res.send("Reserva creada exitosamente. <a href='/dashboard'>Volver</a>");
      }
    }
  );
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

// Servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});




