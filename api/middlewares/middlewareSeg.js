const jwt = require("jsonwebtoken");
const { TOKEN_SECRET } = process.env;
const db = require("../../config/db");

// VERIFICAR TOKEN
function middlewareSeg(req, res, next) {
  const autorizacion = req.headers.authorization;

  if (!autorizacion || !autorizacion.startsWith("Bearer ")) {
    return res.status(401).json({
      mensaje: "No se proporcionó un token",
    });
  }

  const token = autorizacion.split(" ")[1];

  try {
    const user = jwt.verify(token, TOKEN_SECRET);

    const consulta = `
            SELECT Id_usuario, nombre, correo, rol, estado_usuario
            FROM usuarios
            WHERE Id_usuario = ?
        `;

    db.query(consulta, [user.id])
      .then(([resultados]) => {
        if (resultados.length === 0) {
          return res.status(401).json({
            mensaje: "El usuario no existe",
          });
        }

        const usuario = resultados[0];

        const estado = String(usuario.estado_usuario).trim().toLowerCase();

        if (estado !== "1" && estado !== "activo") {
          return res.status(403).json({
            mensaje: "Tu cuenta no está activa",
          });
        }

        req.user = {
          ...usuario,
          id: usuario.Id_usuario,
        };
        next();
      })
      .catch((error) => {
        console.error("Error al verificar usuario:", error);

        res.status(500).json({
          mensaje: "Error al verificar el usuario",
        });
      });
  } catch (error) {
    console.error("Error al verificar token:", error);

    return res.status(401).json({
      mensaje: "Token inválido o vencido",
    });
  }
}

module.exports = middlewareSeg;
