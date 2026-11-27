const router = require("express").Router();
const db = require("../../config/db");

// OBTENER TODOS LOS USUARIOS
router.get("/", (req, res) => {
  db.query(
    `
        SELECT
            u.Id_usuario AS id,
            u.nombre,
            u.correo,
            u.rol,
            u.fecha_registro AS fecha,
            u.foto_perfil,
            eu.Estado AS estado
        FROM usuarios u
        LEFT JOIN estado_usuario eu
            ON CAST(u.estado_usuario AS UNSIGNED) = eu.id_estado_usuario
        WHERE u.rol = 'Usuario'
        ORDER BY u.Id_usuario DESC
    `,
  )
    .then(([usuarios]) => {
      return db
        .query(
          `
            SELECT
                COUNT(*) AS total,
                COALESCE(SUM(eu.Estado = 'Activo'), 0) AS activos,
                COALESCE(SUM(eu.Estado = 'Bloqueado'), 0) AS bloqueados,
                COALESCE(SUM(eu.Estado = 'Expulsado'), 0) AS expulsados
            FROM usuarios u
            LEFT JOIN estado_usuario eu
                ON CAST(u.estado_usuario AS UNSIGNED) = eu.id_estado_usuario
            WHERE u.rol = 'Usuario'
        `,
        )
        .then(([resumen]) => {
          res.json({
            usuarios,
            resumen: resumen[0],
          });
        });
    })
    .catch((error) => {
      console.error("Error al obtener los usuarios:", error);

      res.status(500).json({
        mensaje: "Error al obtener los usuarios",
      });
    });
});

// OBTENER DETALLE DE UN USUARIO
router.get("/:id", (req, res) => {
  const { id } = req.params;

  db.query(
    `
        SELECT
            u.Id_usuario AS id,
            u.nombre,
            u.correo,
            u.\`teléfono\` AS telefono,
            u.\`descripción\` AS descripcion,
            u.fecha_registro AS fecha,
            u.foto_perfil,
            eu.Estado AS estado
        FROM usuarios u
        LEFT JOIN estado_usuario eu
            ON CAST(u.estado_usuario AS UNSIGNED) = eu.id_estado_usuario
        WHERE u.Id_usuario = ?
          AND u.rol = 'Usuario'
    `,
    [id],
  )
    .then(([usuarios]) => {
      if (usuarios.length === 0) {
        res.status(404).json({
          mensaje: "Usuario no encontrado",
        });
        return null;
      }

      return db
        .query(
          `
            SELECT
                tipo_sancion,
                motivo,
                fecha_inicio,
                fecha_fin,
                estado_sancion
            FROM sanciones
            WHERE id_usuario = ?
            ORDER BY fecha_inicio DESC
        `,
          [id],
        )
        .then(([sanciones]) => {
          res.json({
            usuario: usuarios[0],
            sanciones,
          });
        });
    })
    .catch((error) => {
      console.error("Error al obtener el detalle del usuario:", error);

      res.status(500).json({
        mensaje: "Error al obtener el detalle del usuario",
      });
    });
});

// BLOQUEAR USUARIO
router.post("/:id/bloquear", (req, res) => {
  const idUsuario = Number(req.params.id);
  const { motivo, duracion } = req.body;

  const dias = Number(duracion);
  const duracionesPermitidas = [3, 7, 14, 30];

  if (!duracionesPermitidas.includes(dias)) {
    return res.status(400).json({
      mensaje: "La duración del bloqueo no es válida.",
    });
  }

  if (!motivo || !motivo.trim()) {
    return res.status(400).json({
      mensaje: "Debés ingresar el motivo del bloqueo.",
    });
  }

  db.query(
    `
        SELECT Id_usuario, estado_usuario
        FROM usuarios
        WHERE Id_usuario = ?
          AND rol = 'Usuario'
    `,
    [idUsuario],
  )
    .then(([usuarios]) => {
      if (usuarios.length === 0) {
        res.status(404).json({
          mensaje: "Usuario no encontrado.",
        });
        return null;
      }

      if (Number(usuarios[0].estado_usuario) === 3) {
        res.status(409).json({
          mensaje: "Este usuario ya se encuentra bloqueado.",
        });
        return null;
      }

      return db.query(
        `
            INSERT INTO sanciones (
                id_usuario,
                tipo_sancion,
                motivo,
                fecha_inicio,
                fecha_fin,
                estado_sancion
            )
            VALUES (
                ?,
                'Bloqueo',
                ?,
                NOW(),
                DATE_ADD(NOW(), INTERVAL ? DAY),
                'Activa'
            )
        `,
        [idUsuario, motivo.trim(), dias],
      );
    })
    .then((resultado) => {
      if (!resultado) return;

      return db.query(
        `
            UPDATE usuarios
            SET estado_usuario = 3
            WHERE Id_usuario = ?
        `,
        [idUsuario],
      );
    })
    .then((resultado) => {
      if (!resultado) return;

      res.status(201).json({
        mensaje: "Usuario bloqueado correctamente.",
        duracion: dias,
      });
    })
    .catch((error) => {
      console.error("Error al bloquear usuario:", error);

      res.status(500).json({
        mensaje: "Error al bloquear al usuario.",
      });
    });
});

// EXPULSAR USUARIO PERMANENTEMENTE
router.delete("/:id/expulsar", (req, res) => {
  const idUsuario = Number(req.params.id);
  const { motivo } = req.body;

  if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
    return res.status(400).json({
      mensaje: "ID de usuario inválido.",
    });
  }

  if (!motivo || !motivo.trim()) {
    return res.status(400).json({
      mensaje: "Debés ingresar el motivo de la expulsión.",
    });
  }

  db.query(
    `
        SELECT Id_usuario
        FROM usuarios
        WHERE Id_usuario = ?
          AND rol = 'Usuario'
    `,
    [idUsuario],
  )
    .then(([usuarios]) => {
      if (usuarios.length === 0) {
        res.status(404).json({
          mensaje: "Usuario no encontrado.",
        });
        return null;
      }

      return db.query(
        `
            INSERT INTO sanciones (
                Id_usuario,
                tipo_sancion,
                motivo,
                fecha_inicio,
                fecha_fin,
                estado_sancion
            )
            VALUES (?, 'Expulsión', ?, NOW(), NOW(), 'Permanente')
        `,
        [idUsuario, motivo.trim()],
      );
    })
    .then((resultado) => {
      if (resultado === null) return;

      return db.query(
        `
            SELECT DISTINCT pe.Id_pedido
            FROM pedidos pe
            LEFT JOIN carrito_items ci
                ON ci.Id_pedido = pe.Id_pedido
            LEFT JOIN publicaciones_compra pc
                ON pc.id_publicacion_compra = ci.id_publicacion_compra
            LEFT JOIN prendas pr
                ON pr.id_prenda = pc.id_prenda
            WHERE pe.id_comprador = ?
               OR pr.Id_usuario = ?
        `,
        [idUsuario, idUsuario],
      );
    })
    .then((resultado) => {
      if (resultado === null) return;

      const [pedidos] = resultado;

      if (pedidos.length === 0) return;

      const idsPedidos = pedidos.map((p) => p.Id_pedido);
      const placeholders = idsPedidos.map(() => "?").join(",");

      return db
        .query(
          `
            DELETE FROM carrito_items
            WHERE Id_pedido IN (${placeholders})
        `,
          idsPedidos,
        )
        .then(() => {
          return db.query(
            `
                DELETE FROM pedidos
                WHERE Id_pedido IN (${placeholders})
            `,
            idsPedidos,
          );
        });
    })
    .then((resultado) => {
      if (resultado === null) return;

      return db.query(
        `
            DELETE FROM propuestas
            WHERE id_usuario = ?
               OR publicacion_intercambio IN (
                    SELECT pi.Id_publicacion_intercambio
                    FROM publicaciones_intercambio pi
                    INNER JOIN prendas pr
                        ON pr.id_prenda = pi.id_prenda
                    WHERE pr.Id_usuario = ?
               )
        `,
        [idUsuario, idUsuario],
      );
    })
    .then((resultado) => {
      if (!resultado) return;

      return db.query(
        `
            DELETE ca
            FROM categorias_aceptadas ca
            INNER JOIN publicaciones_intercambio pi
                ON pi.Id_publicacion_intercambio = ca.id_publicacion_intercambio
            INNER JOIN prendas pr
                ON pr.id_prenda = pi.id_prenda
            WHERE pr.Id_usuario = ?
        `,
        [idUsuario],
      );
    })
    .then((resultado) => {
      if (!resultado) return;

      return db.query(
        `
            DELETE pi
            FROM publicaciones_intercambio pi
            INNER JOIN prendas pr
                ON pr.id_prenda = pi.id_prenda
            WHERE pr.Id_usuario = ?
        `,
        [idUsuario],
      );
    })
    .then((resultado) => {
      if (!resultado) return;

      return db.query(
        `
            DELETE pc
            FROM publicaciones_compra pc
            INNER JOIN prendas pr
                ON pr.id_prenda = pc.id_prenda
            WHERE pr.Id_usuario = ?
        `,
        [idUsuario],
      );
    })
    .then((resultado) => {
      if (!resultado) return;

      return db.query(
        `
            DELETE po
            FROM prendas_outfits po
            LEFT JOIN prendas pr
                ON pr.id_prenda = po.id_prenda
            LEFT JOIN outfits o
                ON o.id_outfit = po.id_outfit
            WHERE pr.Id_usuario = ?
               OR o.Id_usuario = ?
        `,
        [idUsuario, idUsuario],
      );
    })
    .then((resultado) => {
      if (!resultado) return;

      return db.query(
        `
            DELETE oe
            FROM outfit_estilo oe
            INNER JOIN outfits o
                ON o.id_outfit = oe.id_outfit
            WHERE o.Id_usuario = ?
        `,
        [idUsuario],
      );
    })
    .then((resultado) => {
      if (!resultado) return;

      return db.query(
        `
            DELETE pe
            FROM prendas_estilos pe
            INNER JOIN prendas pr
                ON pr.id_prenda = pe.id_prenda
            WHERE pr.Id_usuario = ?
        `,
        [idUsuario],
      );
    })
    .then((resultado) => {
      if (!resultado) return;

      return db.query(
        `
            DELETE FROM outfits
            WHERE Id_usuario = ?
        `,
        [idUsuario],
      );
    })
    .then((resultado) => {
      if (!resultado) return;

      return db.query(
        `
            DELETE FROM prendas
            WHERE Id_usuario = ?
        `,
        [idUsuario],
      );
    })
    .then((resultado) => {
      if (!resultado) return;

      return db.query(
        `
            DELETE FROM \`notificaciónes\`
            WHERE Id_usuario = ?
        `,
        [idUsuario],
      );
    })
    .then((resultado) => {
      if (!resultado) return;

      return db.query(
        `
            DELETE FROM opciones_usuarios
            WHERE Id_usuario = ?
        `,
        [idUsuario],
      );
    })
    .then((resultado) => {
      if (!resultado) return;

      return db.query(
        `
            UPDATE sanciones
            SET Id_usuario = NULL
            WHERE Id_usuario = ?
        `,
        [idUsuario],
      );
    })
    .then((resultado) => {
      if (!resultado) return;

      return db.query(
        `
            DELETE FROM usuarios
            WHERE Id_usuario = ?
        `,
        [idUsuario],
      );
    })
    .then((resultado) => {
      if (!resultado) return;

      res.status(200).json({
        mensaje:
          "Usuario expulsado y todos sus datos eliminados permanentemente. El historial de sanciones fue conservado.",
      });
    })
    .catch((error) => {
      console.error("Error al eliminar usuario:", error);

      res.status(500).json({
        mensaje: "Error al eliminar al usuario.",
      });
    });
});

module.exports = router;