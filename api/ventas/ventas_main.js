const router = require("express").Router();
const db = require("../../config/db");

router.get("/contadores", (req, res) => {
  const idVendedor = req.user.id;

  const consulta = `
    SELECT
      pc.id_publicacion_compra AS idPublicacion,

      COUNT(DISTINCT CASE
        WHEN ep.estado = 'EN CONTACTO' THEN p.Id_pedido
      END) AS solicitudesPendientes,

      SUM(CASE
        WHEN ep.estado IN ('CONFIRMADO', 'COMPLETADO')
        THEN ci.cantidad
        ELSE 0
      END) AS ventas

    FROM publicaciones_compra pc
    INNER JOIN prendas pr
      ON pc.id_prenda = pr.id_prenda
    LEFT JOIN carrito_items ci
      ON ci.id_publicacion_compra = pc.id_publicacion_compra
    LEFT JOIN pedidos p
      ON p.Id_pedido = ci.Id_pedido
    LEFT JOIN estados_pedidos ep
      ON p.id_estado_pedido = ep.id_estado_pedido
    WHERE pr.Id_usuario = ?
    GROUP BY pc.id_publicacion_compra
  `;

  db.query(consulta, [idVendedor])
    .then(([contadores]) => {
      res.json({ contadores });
    })
    .catch((error) => {
      console.error(error);
      res.status(500).json({ mensaje: "Error al obtener los contadores." });
    });
});

router.get("/", (req, res) => {
  const idVendedor = req.user.id;

  const consulta = `
    SELECT
      p.Id_pedido AS idVenta,
      p.id_comprador AS idComprador,
      p.\`sub total\` AS subtotal,
      ep.estado AS estado,
      ep.icon AS iconoEstado,
      u.nombre AS comprador,
      u.\`teléfono\` AS telefonoComprador,
      u.foto_perfil AS imagenComprador,
      ci.Id_carritoItem AS idItem,
      ci.cantidad AS cantidad,
      pc.id_publicacion_compra AS idPublicacion,
      pc.precio_unitario AS precio,
      pr.id_prenda AS idPrenda,
      pr.nombre AS nombrePrenda,
      pr.imagen AS imagenPrenda

    FROM pedidos p
    INNER JOIN usuarios u
      ON p.id_comprador = u.Id_usuario
    INNER JOIN estados_pedidos ep
      ON p.id_estado_pedido = ep.id_estado_pedido
    INNER JOIN carrito_items ci
      ON p.Id_pedido = ci.Id_pedido
    INNER JOIN publicaciones_compra pc
      ON ci.id_publicacion_compra = pc.id_publicacion_compra
    INNER JOIN prendas pr
      ON pc.id_prenda = pr.id_prenda
    WHERE pr.Id_usuario = ?
    ORDER BY p.Id_pedido DESC
  `;

  db.query(consulta, [idVendedor])
    .then(([resultados]) => {
      const ventas = [];

      resultados.forEach((fila) => {
        let venta = ventas.find((item) => item.id === fila.idVenta);

        if (!venta) {
          venta = {
            id: fila.idVenta,
            idComprador: fila.idComprador,
            comprador: fila.comprador,
            telefonoComprador: fila.telefonoComprador,
            imagenComprador: fila.imagenComprador,
            estado: fila.estado,
            iconoEstado: fila.iconoEstado,
            subtotal: Number(fila.subtotal),
            productos: [],
          };

          ventas.push(venta);
        }

        venta.productos.push({
          idItem: fila.idItem,
          idPublicacion: fila.idPublicacion,
          idPrenda: fila.idPrenda,
          nombre: fila.nombrePrenda,
          imagen: fila.imagenPrenda,
          precio: Number(fila.precio),
          cantidad: Number(fila.cantidad),
        });
      });

      res.json({ ventas });
    })
    .catch((error) => {
      console.error(error);
      res.status(500).json({ mensaje: "Error al obtener las ventas." });
    });
});

router.patch("/:id/estado", (req, res) => {
  const idVendedor = req.user.id;
  const idPedido = req.params.id;
  const { estado } = req.body;

  let conexion;
  let idComprador;
  let idEstado;

  if (!["EN CONTACTO", "CONFIRMADO", "COMPLETADO"].includes(estado)) {
    return res.status(400).json({ mensaje: "Estado no válido." });
  }

  db.getConnection()
    .then((connection) => {
      conexion = connection;

      return conexion.beginTransaction().then(() => {
        return conexion.query(
          `
            SELECT
              p.Id_pedido,
              p.id_comprador,
              ep.estado
            FROM pedidos p
            INNER JOIN estados_pedidos ep
              ON p.id_estado_pedido = ep.id_estado_pedido
            INNER JOIN carrito_items ci
              ON p.Id_pedido = ci.Id_pedido
            INNER JOIN publicaciones_compra pc
              ON ci.id_publicacion_compra = pc.id_publicacion_compra
            INNER JOIN prendas pr
              ON pc.id_prenda = pr.id_prenda
            WHERE p.Id_pedido = ?
              AND pr.Id_usuario = ?
            LIMIT 1
            FOR UPDATE
          `,
          [idPedido, idVendedor],
        );
      });
    })
    .then(([pedidos]) => {
      if (pedidos.length === 0) {
        throw { status: 404, mensaje: "Venta no encontrada." };
      }

      const venta = pedidos[0];

      idComprador = venta.id_comprador;

      if (
        (venta.estado === "EN CONTACTO" && estado !== "CONFIRMADO") ||
        (venta.estado === "CONFIRMADO" && estado !== "COMPLETADO") ||
        venta.estado === "COMPLETADO"
      ) {
        throw {
          status: 400,
          mensaje: "No se puede realizar ese cambio de estado.",
        };
      }

      return conexion.query(
        "SELECT id_estado_pedido FROM estados_pedidos WHERE estado = ?",
        [estado],
      );
    })
    .then(([estados]) => {
      if (estados.length === 0) {
        throw { status: 404, mensaje: "Estado no encontrado." };
      }

      idEstado = estados[0].id_estado_pedido;

      if (estado === "CONFIRMADO") {
        return conexion.query(
          `
            SELECT
              pc.id_publicacion_compra,
              pc.stock,
              ci.cantidad
            FROM carrito_items ci
            INNER JOIN publicaciones_compra pc
              ON ci.id_publicacion_compra = pc.id_publicacion_compra
            WHERE ci.Id_pedido = ?
            FOR UPDATE
          `,
          [idPedido],
        );
      }

      return [[]];
    })
    .then(([productos]) => {
      if (estado === "CONFIRMADO") {
        if (productos.length === 0) {
          throw { status: 400, mensaje: "La venta no tiene productos." };
        }

        productos.forEach((producto) => {
          if (Number(producto.stock) < Number(producto.cantidad)) {
            throw {
              status: 400,
              mensaje: "No hay stock suficiente para confirmar la venta.",
            };
          }
        });

        return productos.reduce((promesa, producto) => {
          return promesa.then(() => {
            return conexion.query(
              `
                UPDATE publicaciones_compra
                SET stock = stock - ?
                WHERE id_publicacion_compra = ?
                  AND stock >= ?
              `,
              [
                producto.cantidad,
                producto.id_publicacion_compra,
                producto.cantidad,
              ],
            );
          });
        }, Promise.resolve());
      }
    })
    .then(() => {
      return conexion.query(
        "UPDATE pedidos SET id_estado_pedido = ? WHERE Id_pedido = ?",
        [idEstado, idPedido],
      );
    })
    .then(() => {
      return conexion.query(
        `
          INSERT INTO notificaciónes
          (Id_usuario, Id_usuario_origen, mensaje, fecha, visto)
          VALUES (?, ?, ?, NOW(), 0)
        `,
        [idComprador, idVendedor, "Tu compra cambió al estado " + estado + "."],
      );
    })
    .then(() => {
      return conexion.commit();
    })
    .then(() => {
      res.json({ mensaje: "Estado actualizado correctamente." });
    })
    .catch((error) => {
      if (conexion) {
        return conexion.rollback().then(() => {
          res.status(error.status || 500).json({
            mensaje: error.mensaje || "Error al actualizar la venta.",
          });
        });
      }

      res.status(500).json({
        mensaje: "Error al conectar con la base de datos.",
      });
    })
    .finally(() => {
      if (conexion) {
        conexion.release();
      }
    });
});

module.exports = router;
