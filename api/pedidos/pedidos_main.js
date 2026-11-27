const router = require("express").Router();
const db = require("../../config/db");

router.get("/", (req, res) => {
  const idComprador = req.user.id;

  const consulta = `
    SELECT DISTINCT
      p.Id_pedido AS id,
      p.id_comprador AS idComprador,
      p.\`sub total\` AS subtotal,
      ep.estado AS estado,
      ep.icon AS iconoEstado,
      u.Id_usuario AS idVendedor,
      u.nombre AS usuario,
      u.\`teléfono\` AS telefono,
      u.foto_perfil AS imagenVendedora
    FROM pedidos p
    LEFT JOIN estados_pedidos ep
      ON p.id_estado_pedido = ep.id_estado_pedido
    INNER JOIN carrito_items ci
      ON p.Id_pedido = ci.Id_pedido
    INNER JOIN publicaciones_compra pc
      ON ci.id_publicacion_compra = pc.id_publicacion_compra
    INNER JOIN prendas pr
      ON pc.id_prenda = pr.id_prenda
    INNER JOIN usuarios u
      ON pr.Id_usuario = u.Id_usuario
    WHERE p.id_comprador = ?
    ORDER BY p.Id_pedido DESC
  `;

  db.query(consulta, [idComprador])
    .then(([resultados]) => {
      const pedidos = resultados.map((fila) => ({
        id: fila.id,
        idComprador: fila.idComprador,
        idVendedor: fila.idVendedor,
        usuario: fila.usuario,
        telefono: fila.telefono,
        imagenVendedora: fila.imagenVendedora,
        estado: fila.estado,
        iconoEstado: fila.iconoEstado,
        subtotal: fila.subtotal,
        expandido: false,
        productos: [],
      }));

      res.json({ pedidos });
    })
    .catch((error) => {
      console.error("Error al obtener pedidos:", error);

      res.status(500).json({
        mensaje: "Error al obtener los pedidos",
      });
    });
});

<<<<<<< HEAD
// CAMBIAR EL PEDIDO A EN CONTACTO
router.patch("/:id/contacto", async (req, res) => {
  const conexion = await db.getConnection();
  try {
    const idComprador = req.user.id;
    const idPedido = req.params.id;
=======
router.patch("/:id/contacto", (req, res) => {
  const idComprador = req.user.id;
  const idPedido = req.params.id;
  let idEstadoContacto;

  db.query(
    `SELECT Id_pedido, id_estado_pedido
     FROM pedidos
     WHERE Id_pedido = ?
     AND id_comprador = ?`,
    [idPedido, idComprador],
  )
    .then(([pedidos]) => {
      if (pedidos.length === 0) {
        res.status(404).json({
          mensaje: "No se encontró el pedido.",
        });
        return null;
      }
>>>>>>> e242142510276739c56b606331344d309062796f

      const pedido = pedidos[0];

      return db
        .query(
          `SELECT id_estado_pedido
           FROM estados_pedidos
           WHERE LOWER(REPLACE(estado, '_', ' ')) = 'en contacto'
           LIMIT 1`,
        )
        .then(([estados]) => {
          if (estados.length === 0) {
            res.status(404).json({
              mensaje: "No se encontró el estado 'En contacto'.",
            });
            return null;
          }

          idEstadoContacto = estados[0].id_estado_pedido;

          if (Number(pedido.id_estado_pedido) === Number(idEstadoContacto)) {
            res.json({
              mensaje: "El pedido ya estaba en contacto.",
              estado: "En contacto",
            });
            return null;
          }

          if (pedido.id_estado_pedido !== null) {
            res.status(400).json({
              mensaje: "Este pedido ya no está pendiente.",
            });
            return null;
          }

          return db.query(
            `SELECT DISTINCT pr.Id_usuario AS idVendedor
             FROM carrito_items ci
             INNER JOIN publicaciones_compra pc
               ON ci.id_publicacion_compra = pc.id_publicacion_compra
             INNER JOIN prendas pr
               ON pc.id_prenda = pr.id_prenda
             WHERE ci.Id_pedido = ?`,
            [idPedido],
          );
        });
    })
    .then((resultado) => {
      if (resultado === null || res.headersSent) return null;

      const [vendedores] = resultado;

      if (vendedores.length === 0) {
        res.status(400).json({
          mensaje: "El pedido no contiene productos.",
        });
        return null;
      }

      return db
        .query(
          `UPDATE pedidos
           SET id_estado_pedido = ?
           WHERE Id_pedido = ?
           AND id_comprador = ?
           AND id_estado_pedido IS NULL`,
          [idEstadoContacto, idPedido, idComprador],
        )
        .then(([actualizacion]) => {
          if (actualizacion.affectedRows !== 1) {
            res.status(409).json({
              mensaje: "El pedido ya fue actualizado.",
            });
            return null;
          }

          const notificaciones = vendedores.map((vendedor) => {
            return db.query(
              `INSERT INTO \`notificaciónes\`
               (Id_usuario, Id_usuario_origen, mensaje, fecha, visto)
               VALUES (?, ?, ?, NOW(), 0)`,
              [
                vendedor.idVendedor,
                idComprador,
                "¡Tenés una nueva compra! Un comprador quiere ponerse en contacto por tu publicación.",
              ],
            );
          });

          return Promise.all(notificaciones);
        });
    })
    .then((resultado) => {
      if (resultado === null || res.headersSent) return;

      res.json({
        mensaje: "El pedido ahora está en contacto.",
        estado: "En contacto",
      });
    })
    .catch((error) => {
      console.error("Error al cambiar el estado:", error);

      if (!res.headersSent) {
        res.status(500).json({
          mensaje: "No se pudo actualizar el estado del pedido.",
        });
      }
    });
});

router.delete("/limpiar", (req, res) => {
  const idComprador = req.user.id;

  db.query(
    `SELECT Id_pedido
     FROM pedidos
     WHERE id_comprador = ?
     AND id_estado_pedido IS NULL`,
    [idComprador],
  )
    .then(([pedidos]) => {
      if (pedidos.length === 0) {
        res.json({
          mensaje: "No hay pedidos pendientes para eliminar.",
        });
        return null;
      }

      const idsPedidos = pedidos.map((pedido) => pedido.Id_pedido);

      return db
        .query(
          `DELETE FROM carrito_items
           WHERE Id_pedido IN (?)`,
          [idsPedidos],
        )
        .then(() => {
          return db.query(
            `DELETE FROM pedidos
             WHERE Id_pedido IN (?)
             AND id_comprador = ?
             AND id_estado_pedido IS NULL`,
            [idsPedidos, idComprador],
          );
        })
        .then(() => pedidos.length);
    })
    .then((cantidad) => {
      if (cantidad === null || res.headersSent) return;

      res.json({
        mensaje: "Se vació el carrito correctamente.",
        pedidosEliminados: cantidad,
      });
    })
    .catch((error) => {
      console.error("Error al limpiar el carrito:", error);

      if (!res.headersSent) {
        res.status(500).json({
          mensaje: "No se pudo vaciar el carrito.",
        });
      }
    });
});

router.delete("/:id", (req, res) => {
  const idPedido = req.params.id;
  const idComprador = req.user.id;

  db.query(
    `SELECT id_estado_pedido
     FROM pedidos
     WHERE Id_pedido = ?
     AND id_comprador = ?`,
    [idPedido, idComprador],
  )
    .then(([pedidos]) => {
      if (pedidos.length === 0) {
        res.status(404).json({
          mensaje: "No se encontró el pedido.",
        });
        return null;
      }

      if (pedidos[0].id_estado_pedido !== null) {
        res.status(400).json({
          mensaje: "No se puede eliminar un pedido que ya está en proceso.",
        });
        return null;
      }

      return db.query(
        `DELETE FROM carrito_items
         WHERE Id_pedido = ?`,
        [idPedido],
      );
    })
    .then((resultado) => {
      if (resultado === null || res.headersSent) return null;

      return db.query(
        `DELETE FROM pedidos
         WHERE Id_pedido = ?
         AND id_comprador = ?`,
        [idPedido, idComprador],
      );
    })
    .then((resultado) => {
      if (resultado === null || res.headersSent) return;

      res.json({
        mensaje: "Pedido eliminado correctamente.",
      });
    })
    .catch((error) => {
      console.error("Error al eliminar el pedido:", error);

      if (!res.headersSent) {
        res.status(500).json({
          mensaje: "Error al eliminar el pedido.",
        });
      }
    });
});

module.exports = router;