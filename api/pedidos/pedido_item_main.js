const router = require("express").Router();
const db = require("../../config/db");

router.get("/", (req, res) => {
  const idComprador = req.user.id;

  const consulta = `
    SELECT
      ci.Id_carritoItem AS id,
      ci.Id_pedido AS idPedido,
      ci.id_publicacion_compra AS idPublicacion,
      ci.cantidad AS cantidad,
      pc.precio_unitario AS precio,
      pc.stock AS stock,
      pr.id_prenda AS idPrenda,
      pr.nombre AS nombre,
      pr.imagen AS imagen
    FROM carrito_items ci
    INNER JOIN pedidos p
      ON ci.Id_pedido = p.Id_pedido
    INNER JOIN publicaciones_compra pc
      ON ci.id_publicacion_compra = pc.id_publicacion_compra
    INNER JOIN prendas pr
      ON pc.id_prenda = pr.id_prenda
    WHERE p.id_comprador = ?
    ORDER BY ci.Id_pedido DESC
  `;

  db.query(consulta, [idComprador])
    .then(([resultados]) => {
      const pedidoItems = resultados.map((fila) => ({
        id: fila.id,
        idPedido: fila.idPedido,
        idPublicacion: fila.idPublicacion,
        idPrenda: fila.idPrenda,
        nombre: fila.nombre,
        imagen: fila.imagen,
        precio: fila.precio,
        cantidad: fila.cantidad,
        stock: fila.stock,
      }));

      res.json({ pedidoItems });
    })
    .catch((error) => {
      console.error("Error al obtener los items:", error);

      res.status(500).json({
        mensaje: "Error al obtener los productos de los pedidos",
      });
    });
});

router.post("/", (req, res) => {
  const idComprador = req.user.id;
  const { idPublicacion } = req.body;

  let publicacion;
  let idPedido;
  let idCarritoItem;
  let cantidad;

  if (!idPublicacion) {
    return res.status(400).json({
      mensaje: "No se recibió la publicación.",
    });
  }

  db.query(
    `SELECT
      pc.id_publicacion_compra AS idPublicacion,
      pc.precio_unitario AS precio,
      pc.stock AS stock,
      pr.Id_usuario AS idVendedor
     FROM publicaciones_compra pc
     INNER JOIN prendas pr
       ON pc.id_prenda = pr.id_prenda
     WHERE pc.id_publicacion_compra = ?`,
    [idPublicacion],
  )
    .then(([publicaciones]) => {
      if (publicaciones.length === 0) {
        res.status(404).json({
          mensaje: "La publicación no existe.",
        });
        return null;
      }

      publicacion = publicaciones[0];

      if (publicacion.stock <= 0) {
        res.status(400).json({
          mensaje: "Esta publicación no tiene stock disponible.",
        });
        return null;
      }

      if (Number(publicacion.idVendedor) === Number(idComprador)) {
        res.status(400).json({
          mensaje: "No podés agregar tu propia publicación al carrito.",
        });
        return null;
      }

      return db.query(
        `SELECT p.Id_pedido AS id
         FROM pedidos p
         WHERE p.id_comprador = ?
         AND p.id_estado_pedido IS NULL
         AND EXISTS (
           SELECT 1
           FROM carrito_items ci
           INNER JOIN publicaciones_compra pc
             ON ci.id_publicacion_compra = pc.id_publicacion_compra
           INNER JOIN prendas pr
             ON pc.id_prenda = pr.id_prenda
           WHERE ci.Id_pedido = p.Id_pedido
           AND pr.Id_usuario = ?
         )
         LIMIT 1`,
        [idComprador, publicacion.idVendedor],
      );
    })
    .then((resultado) => {
      if (resultado === null || res.headersSent) return null;

      const [pedidos] = resultado;

      if (pedidos.length > 0) {
        idPedido = pedidos[0].id;

        return db.query(
          `SELECT Id_carritoItem AS id, cantidad
           FROM carrito_items
           WHERE Id_pedido = ?
           AND id_publicacion_compra = ?`,
          [idPedido, idPublicacion],
        );
      }

      return db
        .query(
          `INSERT INTO pedidos
        (id_comprador, \`sub total\`, id_estado_pedido)
        VALUES (?, 0, NULL)`,
          [idComprador],
        )
        .then(([nuevoPedido]) => {
          idPedido = nuevoPedido.insertId;

          return db.query(
            `SELECT Id_carritoItem AS id, cantidad
           FROM carrito_items
           WHERE Id_pedido = ?
           AND id_publicacion_compra = ?`,
            [idPedido, idPublicacion],
          );
        });
    })
    .then((resultado) => {
      if (resultado === null || res.headersSent) return null;

      const [items] = resultado;

      if (items.length > 0) {
        cantidad = items[0].cantidad + 1;
        idCarritoItem = items[0].id;

        if (cantidad > publicacion.stock) {
          res.status(400).json({
            mensaje: "No hay suficiente stock disponible.",
          });
          return null;
        }

        return db.query(
          `UPDATE carrito_items
           SET cantidad = ?
           WHERE Id_carritoItem = ?`,
          [cantidad, idCarritoItem],
        );
      }

      cantidad = 1;

      return db
        .query(
          `INSERT INTO carrito_items
        (Id_pedido, id_publicacion_compra, cantidad)
        VALUES (?, ?, ?)`,
          [idPedido, idPublicacion, cantidad],
        )
        .then(([nuevoItem]) => {
          idCarritoItem = nuevoItem.insertId;
          return true;
        });
    })
    .then((resultado) => {
      if (resultado === null || res.headersSent) return null;

      return db.query(
        `UPDATE pedidos
         SET \`sub total\` = (
           SELECT COALESCE(SUM(ci.cantidad * pc.precio_unitario), 0)
           FROM carrito_items ci
           INNER JOIN publicaciones_compra pc
             ON ci.id_publicacion_compra = pc.id_publicacion_compra
           WHERE ci.Id_pedido = ?
         )
         WHERE Id_pedido = ?`,
        [idPedido, idPedido],
      );
    })
    .then((resultado) => {
      if (resultado === null || res.headersSent) return;

      res.status(201).json({
        mensaje: "¡Producto agregado al carrito!",
        idPedido,
        idCarritoItem,
        cantidad,
      });
    })
    .catch((error) => {
      console.error("Error al agregar al carrito:", error);

      if (!res.headersSent) {
        res.status(500).json({
          mensaje: "Error al agregar el producto al carrito.",
        });
      }
    });
});

router.patch("/:id", (req, res) => {
  const idCarritoItem = req.params.id;
  const idComprador = req.user.id;
  const cantidad = Number(req.body.cantidad);

  let item;
  let subtotal;

  if (!Number.isInteger(cantidad) || cantidad < 1) {
    return res.status(400).json({
      mensaje: "La cantidad debe ser un número entero mayor a cero",
    });
  }

  db.query(
    `SELECT
      ci.Id_carritoItem,
      ci.Id_pedido,
      pc.stock
     FROM carrito_items ci
     INNER JOIN pedidos p
       ON ci.Id_pedido = p.Id_pedido
     INNER JOIN publicaciones_compra pc
       ON ci.id_publicacion_compra = pc.id_publicacion_compra
     WHERE ci.Id_carritoItem = ?
     AND p.id_comprador = ?
     AND p.id_estado_pedido IS NULL`,
    [idCarritoItem, idComprador],
  )
    .then(([items]) => {
      if (items.length === 0) {
        res.status(404).json({
          mensaje: "No se encontró el producto en tu carrito",
        });
        return null;
      }

      item = items[0];

      if (cantidad > item.stock) {
        res.status(400).json({
          mensaje: "No hay suficiente stock disponible",
          stock: item.stock,
        });
        return null;
      }

      return db.query(
        `UPDATE carrito_items
         SET cantidad = ?
         WHERE Id_carritoItem = ?`,
        [cantidad, idCarritoItem],
      );
    })
    .then((resultado) => {
      if (resultado === null || res.headersSent) return null;

      return db.query(
        `SELECT COALESCE(
          SUM(ci.cantidad * pc.precio_unitario), 0
        ) AS subtotal
         FROM carrito_items ci
         INNER JOIN publicaciones_compra pc
           ON ci.id_publicacion_compra = pc.id_publicacion_compra
         WHERE ci.Id_pedido = ?`,
        [item.Id_pedido],
      );
    })
    .then((resultado) => {
      if (resultado === null || res.headersSent) return null;

      const [resultados] = resultado;
      subtotal = resultados[0].subtotal;

      return db.query(
        `UPDATE pedidos
         SET \`sub total\` = ?
         WHERE Id_pedido = ?`,
        [subtotal, item.Id_pedido],
      );
    })
    .then((resultado) => {
      if (resultado === null || res.headersSent) return;

      res.json({
        mensaje: "Cantidad y subtotal actualizados correctamente",
        cantidad,
        subtotal,
      });
    })
    .catch((error) => {
      console.error("Error al modificar el carrito:", error);

      if (!res.headersSent) {
        res.status(500).json({
          mensaje: "Error al modificar el producto del carrito",
        });
      }
    });
});

router.delete("/:id", (req, res) => {
  const idCarritoItem = req.params.id;
  const idComprador = req.user.id;

  let idPedido;
  let subtotal;

  db.query(
    `SELECT
      ci.Id_carritoItem,
      ci.Id_pedido
     FROM carrito_items ci
     INNER JOIN pedidos p
       ON ci.Id_pedido = p.Id_pedido
     WHERE ci.Id_carritoItem = ?
     AND p.id_comprador = ?
     AND p.id_estado_pedido IS NULL`,
    [idCarritoItem, idComprador],
  )
    .then(([items]) => {
      if (items.length === 0) {
        res.status(404).json({
          mensaje: "No se encontró el producto en tu carrito",
        });
        return null;
      }

      idPedido = items[0].Id_pedido;

      return db.query(
        `DELETE FROM carrito_items
         WHERE Id_carritoItem = ?`,
        [idCarritoItem],
      );
    })
    .then((resultado) => {
      if (resultado === null || res.headersSent) return null;

      return db.query(
        `SELECT COALESCE(
          SUM(ci.cantidad * pc.precio_unitario), 0
        ) AS subtotal
         FROM carrito_items ci
         INNER JOIN publicaciones_compra pc
           ON ci.id_publicacion_compra = pc.id_publicacion_compra
         WHERE ci.Id_pedido = ?`,
        [idPedido],
      );
    })
    .then((resultado) => {
      if (resultado === null || res.headersSent) return null;

      const [resultados] = resultado;
      subtotal = resultados[0].subtotal;

      return db.query(
        `UPDATE pedidos
         SET \`sub total\` = ?
         WHERE Id_pedido = ?`,
        [subtotal, idPedido],
      );
    })
    .then((resultado) => {
      if (resultado === null || res.headersSent) return;

      res.json({
        mensaje: "Producto eliminado correctamente",
        subtotal,
      });
    })
    .catch((error) => {
      console.error("Error al eliminar producto del carrito:", error);

      if (!res.headersSent) {
        res.status(500).json({
          mensaje: "Error al eliminar el producto del carrito",
        });
      }
    });
});

module.exports = router;