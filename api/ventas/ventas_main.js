const router = require("express").Router();
const db = require("../../config/db");

// OBTENER CONTADORES DE LAS PUBLICACIONES DE COMPRA
router.get("/contadores", async (req, res) => {
  try {
    const idVendedor = req.user.id;

    const consulta = `
      SELECT
        pc.id_publicacion_compra AS idPublicacion,

        COUNT(DISTINCT CASE
          WHEN UPPER(REPLACE(ep.estado, '_', ' ')) = 'EN CONTACTO'
          THEN p.Id_pedido
        END) AS solicitudesPendientes,

        COALESCE(
          SUM(
            CASE
              WHEN UPPER(REPLACE(ep.estado, '_', ' '))
                IN ('CONFIRMADO', 'COMPLETADO')
              THEN ci.cantidad
              ELSE 0
            END
          ),
          0
        ) AS ventas

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

    const [contadores] = await db.query(consulta, [idVendedor]);

    return res.json({ contadores });
  } catch (error) {
    console.error("Error al obtener los contadores:", error);

    return res.status(500).json({
      mensaje: "Error al obtener los contadores.",
    });
  }
});

// OBTENER VENTAS DEL VENDEDOR
router.get("/", async (req, res) => {
  try {
    const idVendedor = req.user.id;

    const consulta = `
      SELECT
        p.Id_pedido AS idVenta,
        p.id_comprador AS idComprador,
        p.\`sub total\` AS subtotal,

        ep.estado AS estado,
        ep.icon AS iconoEstado,

        u.Id_usuario AS idUsuarioComprador,
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
        AND p.id_estado_pedido IS NOT NULL

      ORDER BY p.Id_pedido DESC
    `;

    const [resultados] = await db.query(consulta, [idVendedor]);

    const ventasMap = new Map();

    resultados.forEach((fila) => {
      if (!ventasMap.has(fila.idVenta)) {
        ventasMap.set(fila.idVenta, {
          id: fila.idVenta,
          idComprador: fila.idComprador,
          comprador: fila.comprador,
          telefonoComprador: fila.telefonoComprador,
          imagenComprador: fila.imagenComprador,
          estado: fila.estado,
          iconoEstado: fila.iconoEstado,
          subtotal: Number(fila.subtotal),
          productos: [],
        });
      }

      ventasMap.get(fila.idVenta).productos.push({
        idItem: fila.idItem,
        idPublicacion: fila.idPublicacion,
        idPrenda: fila.idPrenda,
        nombre: fila.nombrePrenda,
        imagen: fila.imagenPrenda,
        precio: Number(fila.precio),
        cantidad: Number(fila.cantidad),
      });
    });

    return res.json({
      ventas: Array.from(ventasMap.values()),
    });
  } catch (error) {
    console.error("Error al obtener las ventas:", error);

    return res.status(500).json({
      mensaje: "Error al obtener las ventas.",
    });
  }
});

// ACTUALIZAR ESTADO DE UNA VENTA
router.patch("/:id/estado", async (req, res) => {
  const conexion = await db.getConnection();

  try {
    const idVendedor = req.user.id;
    const idVenta = req.params.id;

    const estadoSolicitado = String(req.body.estado || "")
      .trim()
      .toUpperCase()
      .replace(/_/g, " ");

    const estadosPermitidos = ["EN CONTACTO", "CONFIRMADO", "COMPLETADO"];

    if (!estadosPermitidos.includes(estadoSolicitado)) {
      return res.status(400).json({
        mensaje: "El estado ingresado no es válido.",
      });
    }

    await conexion.beginTransaction();

    // BLOQUEAR EL PEDIDO PARA EVITAR ACTUALIZACIONES SIMULTÁNEAS
    const [pedidos] = await conexion.query(
      `
        SELECT
          p.Id_pedido AS idVenta,
          p.id_comprador AS idComprador,
          ep.estado AS estadoActual

        FROM pedidos p

        LEFT JOIN estados_pedidos ep
          ON p.id_estado_pedido = ep.id_estado_pedido

        WHERE p.Id_pedido = ?

        FOR UPDATE
      `,
      [idVenta],
    );

    if (pedidos.length === 0) {
      await conexion.rollback();

      return res.status(404).json({
        mensaje: "No se encontró el pedido.",
      });
    }

    const pedido = pedidos[0];
    const idComprador = pedido.idComprador;

    const estadoActual = String(pedido.estadoActual || "")
      .trim()
      .toUpperCase()
      .replace(/_/g, " ");

    // OBTENER TODOS LOS PRODUCTOS DEL PEDIDO Y BLOQUEAR SU STOCK
    const [productos] = await conexion.query(
      `
        SELECT
          ci.Id_carritoItem AS idItem,
          ci.cantidad,
          pc.id_publicacion_compra AS idPublicacion,
          pc.stock,
          pr.Id_usuario AS idVendedor

        FROM carrito_items ci

        INNER JOIN publicaciones_compra pc
          ON ci.id_publicacion_compra = pc.id_publicacion_compra

        INNER JOIN prendas pr
          ON pc.id_prenda = pr.id_prenda

        WHERE ci.Id_pedido = ?

        FOR UPDATE
      `,
      [idVenta],
    );

    if (productos.length === 0) {
      await conexion.rollback();

      return res.status(400).json({
        mensaje: "El pedido no contiene productos.",
      });
    }

    // COMPROBAR QUE TODAS LAS PUBLICACIONES DEL PEDIDO PERTENEZCAN AL VENDEDOR
    const pedidoPerteneceAlVendedor = productos.every(
      (producto) => Number(producto.idVendedor) === Number(idVendedor),
    );

    if (!pedidoPerteneceAlVendedor) {
      await conexion.rollback();

      return res.status(403).json({
        mensaje: "No podés modificar este pedido.",
      });
    }

    // VALIDAR TRANSICIONES DE ESTADO
    if (estadoActual === estadoSolicitado) {
      await conexion.commit();

      return res.json({
        mensaje: "El pedido ya tiene ese estado.",
        estado: estadoSolicitado,
      });
    }

    const transicionesPermitidas = {
      "EN CONTACTO": ["CONFIRMADO"],
      CONFIRMADO: ["COMPLETADO"],
      COMPLETADO: [],
    };

    if (
      !transicionesPermitidas[estadoActual] ||
      !transicionesPermitidas[estadoActual].includes(estadoSolicitado)
    ) {
      await conexion.rollback();

      return res.status(400).json({
        mensaje: "No se permite realizar ese cambio de estado.",
      });
    }

    // BUSCAR EL ID DEL NUEVO ESTADO
    const [estados] = await conexion.query(
      `
        SELECT id_estado_pedido
        FROM estados_pedidos
        WHERE UPPER(REPLACE(estado, '_', ' ')) = ?
        LIMIT 1
      `,
      [estadoSolicitado],
    );

    if (estados.length === 0) {
      await conexion.rollback();

      return res.status(404).json({
        mensaje: "No se encontró el estado en la base de datos.",
      });
    }

    const idEstado = estados[0].id_estado_pedido;

    // SI SE CONFIRMA, VALIDAR Y DESCONTAR EL STOCK
    if (estadoSolicitado === "CONFIRMADO") {
      // PRIMERO COMPROBAR QUE HAYA STOCK PARA TODOS LOS PRODUCTOS
      for (const producto of productos) {
        const cantidad = Number(producto.cantidad);
        const stock = Number(producto.stock);

        if (!Number.isInteger(cantidad) || cantidad <= 0) {
          await conexion.rollback();

          return res.status(400).json({
            mensaje: "La cantidad de un producto del pedido no es válida.",
          });
        }

        if (stock < cantidad) {
          await conexion.rollback();

          return res.status(409).json({
            mensaje:
              "No hay stock suficiente para confirmar todos los productos del pedido.",
            idPublicacion: producto.idPublicacion,
            stockDisponible: stock,
            cantidadSolicitada: cantidad,
          });
        }
      }

      // DESCONTAR EL STOCK DE CADA PUBLICACIÓN
      for (const producto of productos) {
        const [resultado] = await conexion.query(
          `
            UPDATE publicaciones_compra
            SET stock = stock - ?
            WHERE id_publicacion_compra = ?
              AND stock >= ?
          `,
          [
            Number(producto.cantidad),
            producto.idPublicacion,
            Number(producto.cantidad),
          ],
        );

        if (resultado.affectedRows !== 1) {
          throw new Error("No se pudo actualizar el stock de una publicación.");
        }
      }
    }

    // ACTUALIZAR EL ESTADO DEL PEDIDO
    await conexion.query(
      `
        UPDATE pedidos
        SET id_estado_pedido = ?
        WHERE Id_pedido = ?
      `,
      [idEstado, idVenta],
    );

    // CREAR NOTIFICACIÓN PARA EL COMPRADOR
    const mensaje = `El estado de tu pedido cambió a ${estadoSolicitado}.`;

    await conexion.query(
      `
        INSERT INTO \`notificaciónes\`
          (Id_usuario, Id_usuario_origen, mensaje, fecha, visto)
        VALUES (?, ?, ?, NOW(), 0)
      `,
      [idComprador, idVendedor, mensaje],
    );

    await conexion.commit();

    return res.json({
      mensaje: "Estado actualizado correctamente.",
      estado: estadoSolicitado,
    });
  } catch (error) {
    await conexion.rollback();

    console.error("Error al actualizar el estado de la venta:", error);

    return res.status(500).json({
      mensaje: "Error al actualizar el estado de la venta.",
    });
  } finally {
    conexion.release();
  }
});

module.exports = router;
