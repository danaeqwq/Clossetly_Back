const router = require("express").Router();
const db = require("../../config/db");

router.get("/", async (req, res) => {
  try {
    const id_usuario = req.user.id;

    const consulta = `
      SELECT
        n.Id_notificacion,
        n.Id_usuario,
        n.Id_usuario_origen,
        n.mensaje,
        n.mensaje AS detalle,
        NULL AS accion,
        DATE_FORMAT(
          n.fecha,
          '%Y-%m-%dT%H:%i:%sZ'
        ) AS fecha,
        n.visto,
        u.nombre AS usuario,
        u.foto_perfil,
        u.\`teléfono\` AS telefono
      FROM \`notificaciónes\` n
      LEFT JOIN usuarios u
        ON n.Id_usuario_origen = u.Id_usuario
      WHERE n.Id_usuario = ?
      ORDER BY n.fecha DESC
    `;

    const [notificaciones] = await db.query(consulta, [id_usuario]);

    res.json(notificaciones);
  } catch (error) {
    console.error("Error al obtener notificaciones:", error);

    res.status(500).json({
      mensaje: "Error al obtener las notificaciones",
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id_usuario = req.user.id;
    const { id } = req.params;

    const consulta = `
      SELECT
        n.Id_notificacion,
        n.Id_usuario,
        n.Id_usuario_origen,
        n.mensaje,
        n.mensaje AS detalle,
        NULL AS accion,
        DATE_FORMAT(
          n.fecha,
          '%Y-%m-%dT%H:%i:%sZ'
        ) AS fecha,
        n.visto,
        u.nombre AS usuario,
        u.foto_perfil,
        u.\`teléfono\` AS telefono
      FROM \`notificaciónes\` n
      LEFT JOIN usuarios u
        ON n.Id_usuario_origen = u.Id_usuario
      WHERE n.Id_notificacion = ?
    `;

    const [notificaciones] = await db.query(consulta, [id]);

    if (notificaciones.length === 0) {
      return res.status(404).json({
        mensaje: "La notificación no existe",
      });
    }

    if (Number(notificaciones[0].Id_usuario) !== Number(id_usuario)) {
      return res.status(403).json({
        mensaje: "No tenés permiso para ver esta notificación",
      });
    }

    res.json(notificaciones[0]);
  } catch (error) {
    console.error("Error al obtener notificación:", error);

    res.status(500).json({
      mensaje: "Error al obtener la notificación",
    });
  }
});

// MARCAR NOTIFICACIÓN COMO LEÍDA
router.patch("/:id/leida", async (req, res) => {
  try {
    const id_usuario = req.user.id;
    const { id } = req.params;

    const consulta = `
      SELECT
        Id_notificacion,
        Id_usuario
      FROM \`notificaciónes\`
      WHERE Id_notificacion = ?
    `;

    const [notificaciones] = await db.query(consulta, [id]);

    if (notificaciones.length === 0) {
      return res.status(404).json({
        mensaje: "La notificación no existe",
      });
    }

    if (Number(notificaciones[0].Id_usuario) !== Number(id_usuario)) {
      return res.status(403).json({
        mensaje: "No tenés permiso para modificar esta notificación",
      });
    }

    const consultaActualizar = `
      UPDATE \`notificaciónes\`
      SET visto = 1
      WHERE Id_notificacion = ?
    `;

    await db.query(consultaActualizar, [id]);

    res.json({
      mensaje: "Notificación marcada como leída",
    });
  } catch (error) {
    console.error("Error al marcar notificación:", error);

    res.status(500).json({
      mensaje: "Error al marcar la notificación como leída",
    });
  }
});

module.exports = router;
