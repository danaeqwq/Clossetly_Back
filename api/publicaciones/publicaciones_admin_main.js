const router = require("express").Router();
const db = require("../../config/db");

const consultaPublicaciones = `
  SELECT
    pc.id_publicacion_compra AS id,
    'compra' AS tipo,
    pr.id_prenda AS idPrenda,
    pr.nombre,
    t.talla AS talle,
    pr.imagen,
    pr.Id_usuario AS idUsuario,
    u.nombre AS usuario,
    pc.precio_unitario AS precio,
    pc.stock AS stock,
    NULL AS talleBuscado,
    c.codigo AS codigoColor,
    c.color AS color
  FROM publicaciones_compra pc
  INNER JOIN prendas pr
    ON pr.id_prenda = pc.id_prenda
  LEFT JOIN usuarios u
    ON u.Id_usuario = pr.Id_usuario
  LEFT JOIN colores c
    ON c.id_color = pr.id_color
  LEFT JOIN tallas t
    ON t.id_talla = pr.id_talla

  UNION ALL

  SELECT
    pi.Id_publicacion_intercambio AS id,
    'intercambio' AS tipo,
    pr.id_prenda AS idPrenda,
    pr.nombre,
    t.talla AS talle,
    pr.imagen,
    pr.Id_usuario AS idUsuario,
    u.nombre AS usuario,
    NULL AS precio,
    NULL AS stock,
    pi.talle_buscado AS talleBuscado,
    c.codigo AS codigoColor,
    c.color AS color
  FROM publicaciones_intercambio pi
  INNER JOIN prendas pr
    ON pr.id_prenda = pi.id_prenda
  LEFT JOIN usuarios u
    ON u.Id_usuario = pr.Id_usuario
  LEFT JOIN colores c
    ON c.id_color = pr.id_color
  LEFT JOIN tallas t
    ON t.id_talla = pr.id_talla
`;

router.get("/", (req, res) => {
  const { tipo } = req.query;

  if (tipo && !["compra", "intercambio"].includes(tipo)) {
    return res.status(400).json({
      mensaje: "El tipo debe ser compra o intercambio.",
    });
  }

  let consulta = `
    SELECT *
    FROM (${consultaPublicaciones}) AS publicaciones
    WHERE 1 = 1
  `;

  const parametros = [];

  if (tipo) {
    consulta += ` AND tipo = ?`;
    parametros.push(tipo);
  }

  consulta += ` ORDER BY id DESC`;

  db.query(consulta, parametros)
    .then(([publicaciones]) => {
      res.json({
        publicaciones,
      });
    })
    .catch((error) => {
      console.error("Error al obtener publicaciones:", error);

      res.status(500).json({
        mensaje: "Error al obtener las publicaciones.",
      });
    });
});

router.get("/:id", (req, res) => {
  const id = Number(req.params.id);
  const { tipo } = req.query;

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      mensaje: "El ID de la publicación no es válido.",
    });
  }

  if (!["compra", "intercambio"].includes(tipo)) {
    return res.status(400).json({
      mensaje: "El tipo debe ser compra o intercambio.",
    });
  }

  const consulta = `
    SELECT *
    FROM (${consultaPublicaciones}) AS publicaciones
    WHERE id = ?
      AND tipo = ?
  `;

  db.query(consulta, [id, tipo])
    .then(([publicaciones]) => {
      if (publicaciones.length === 0) {
        return res.status(404).json({
          mensaje: "Publicación no encontrada.",
        });
      }

      res.json({
        publicacion: publicaciones[0],
      });
    })
    .catch((error) => {
      console.error("Error al obtener el detalle:", error);

      res.status(500).json({
        mensaje: "Error al obtener la publicación.",
      });
    });
});

router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  const { tipo, motivo } = req.body;
  const idAdmin = req.user.id;

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      mensaje: "El ID de la publicación no es válido.",
    });
  }

  if (!["compra", "intercambio"].includes(tipo)) {
    return res.status(400).json({
      mensaje: "El tipo debe ser compra o intercambio.",
    });
  }

  if (typeof motivo !== "string" || !motivo.trim()) {
    return res.status(400).json({
      mensaje: "El motivo de eliminación es obligatorio.",
    });
  }

  const tabla =
    tipo === "compra" ? "publicaciones_compra" : "publicaciones_intercambio";

  const columnaId =
    tipo === "compra" ? "id_publicacion_compra" : "Id_publicacion_intercambio";

  db.query(
    `
      SELECT pr.Id_usuario AS idUsuario
      FROM ${tabla} p
      INNER JOIN prendas pr
        ON pr.id_prenda = p.id_prenda
      WHERE p.${columnaId} = ?
    `,
    [id],
  )
    .then(([publicaciones]) => {
      if (publicaciones.length === 0) {
        return res.status(404).json({
          mensaje: "Publicación no encontrada.",
        });
      }

      const idUsuario = publicaciones[0].idUsuario;

      if (!idUsuario) {
        return res.status(400).json({
          mensaje: "No se pudo identificar al dueño de la publicación.",
        });
      }

      const mensaje = `Tu publicación fue eliminada por el administrador. Motivo: ${motivo.trim()}`;

      return db.query(
        `
          INSERT INTO \`notificaciónes\` (
            Id_usuario,
            Id_usuario_origen,
            mensaje,
            fecha,
            visto
          )
          VALUES (?, ?, ?, NOW(), 0)
        `,
        [idUsuario, idAdmin, mensaje],
      );
    })
    .then((resultado) => {
      if (resultado === undefined) return;

      return db.query(
        `
          DELETE FROM ${tabla}
          WHERE ${columnaId} = ?
        `,
        [id],
      );
    })
    .then((resultado) => {
      if (resultado === undefined) return;

      if (resultado[0].affectedRows === 0) {
        return res.status(404).json({
          mensaje: "Publicación no encontrada.",
        });
      }

      res.json({
        mensaje: "Publicación eliminada y notificación enviada correctamente.",
        id,
        tipo,
      });
    })
    .catch((error) => {
      console.error("Error al eliminar la publicación:", error);

      res.status(500).json({
        mensaje:
          "No se pudo eliminar la publicación ni enviar la notificación.",
      });
    });
});

module.exports = router;