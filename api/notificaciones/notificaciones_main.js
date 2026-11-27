const router = require("express").Router();
const db = require("../../config/db");

router.get("/", (req, res) => {
  const idUsuario = req.user.id;

  db.query(
    `
        SELECT
            n.Id_notificacion,
            n.Id_usuario,
            n.Id_usuario_origen,
            n.mensaje,
            n.mensaje AS detalle,
            NULL AS accion,
            DATE_FORMAT(n.fecha, '%Y-%m-%dT%H:%i:%sZ') AS fecha,
            n.visto,
            u.nombre AS usuario,
            u.foto_perfil,
            u.\`teléfono\` AS telefono
        FROM \`notificaciónes\` n
        LEFT JOIN usuarios u
            ON n.Id_usuario_origen = u.Id_usuario
        WHERE n.Id_usuario = ?
        ORDER BY n.fecha DESC, n.Id_notificacion DESC
    `,
    [idUsuario],
  )
    .then(([notificaciones]) => {
      res.json(notificaciones);
    })
    .catch((error) => {
      console.error("Error al obtener notificaciones:", error);

      res.status(500).json({
        mensaje: "Error al obtener las notificaciones",
      });
    });
});

router.get("/:id", (req, res) => {
  const idUsuario = req.user.id;
  const { id } = req.params;

  db.query(
    `
        SELECT
            n.Id_notificacion,
            n.Id_usuario,
            n.Id_usuario_origen,
            n.mensaje,
            n.mensaje AS detalle,
            NULL AS accion,
            DATE_FORMAT(n.fecha, '%Y-%m-%dT%H:%i:%sZ') AS fecha,
            n.visto,
            u.nombre AS usuario,
            u.foto_perfil,
            u.\`teléfono\` AS telefono
        FROM \`notificaciónes\` n
        LEFT JOIN usuarios u
            ON n.Id_usuario_origen = u.Id_usuario
        WHERE n.Id_notificacion = ?
    `,
    [id],
  )
    .then(([notificaciones]) => {
      if (notificaciones.length === 0) {
        res.status(404).json({
          mensaje: "La notificación no existe",
        });
        return null;
      }

      if (Number(notificaciones[0].Id_usuario) !== Number(idUsuario)) {
        res.status(403).json({
          mensaje: "No tenés permiso para ver esta notificación",
        });
        return null;
      }

      res.json(notificaciones[0]);
    })
    .catch((error) => {
      console.error("Error al obtener notificación:", error);

      res.status(500).json({
        mensaje: "Error al obtener la notificación",
      });
    });
});

router.patch("/:id/leida", (req, res) => {
  const idUsuario = req.user.id;
  const { id } = req.params;

  db.query(
    `
        SELECT Id_notificacion, Id_usuario
        FROM \`notificaciónes\`
        WHERE Id_notificacion = ?
    `,
    [id],
  )
    .then(([notificaciones]) => {
      if (notificaciones.length === 0) {
        res.status(404).json({
          mensaje: "La notificación no existe",
        });
        return null;
      }

      if (Number(notificaciones[0].Id_usuario) !== Number(idUsuario)) {
        res.status(403).json({
          mensaje: "No tenés permiso para modificar esta notificación",
        });
        return null;
      }

      return db.query(
        `
            UPDATE \`notificaciónes\`
            SET visto = 1
            WHERE Id_notificacion = ?
        `,
        [id],
      );
    })
    .then((resultado) => {
      if (!resultado) return;

      res.json({
        mensaje: "Notificación marcada como leída",
      });
    })
    .catch((error) => {
      console.error("Error al marcar notificación:", error);

      res.status(500).json({
        mensaje: "Error al marcar la notificación como leída",
      });
    });
});

module.exports = router;
