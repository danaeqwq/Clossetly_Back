const router = require("express").Router();
const db = require("../../config/db");

// OBTENER PEDIDOS DEL USUARIO LOGUEADO
router.get("/", async (req, res) => {
  try {
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

    const [resultados] = await db.query(consulta, [idComprador]);

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

    return res.json({ pedidos });
  } catch (error) {
    console.error("Error al obtener pedidos:", error);

    return res.status(500).json({
      mensaje: "Error al obtener los pedidos",
    });
  }
});

// CAMBIAR EL PEDIDO A EN CONTACTO
router.patch("/:id/contacto", async (req, res) => {
  const conexion = await db.getConnection();
  try {
    const idComprador = req.user.id;
    const idPedido = req.params.id;

    await conexion.beginTransaction();

    // BLOQUEAR EL PEDIDO Y COMPROBAR QUE PERTENECE AL COMPRADOR
    const [pedidos] = await conexion.query(
      `
            SELECT
                p.Id_pedido,
                p.id_estado_pedido
            FROM pedidos p
            WHERE p.Id_pedido = ?
              AND p.id_comprador = ?
            FOR UPDATE
        `,
      [idPedido, idComprador],
    );

    if (pedidos.length === 0) {
      await conexion.rollback();

      return res.status(404).json({
        mensaje: "No se encontró el pedido.",
      });
    }

    const pedido = pedidos[0];

    // BUSCAR EL ESTADO EN CONTACTO
    const [estados] = await conexion.query(`
            SELECT id_estado_pedido
            FROM estados_pedidos
            WHERE LOWER(REPLACE(estado, '_', ' ')) = 'en contacto'
            LIMIT 1
        `);

    if (estados.length === 0) {
      await conexion.rollback();

      return res.status(404).json({
        mensaje: "No se encontró el estado 'En contacto'.",
      });
    }

    const idEstadoContacto = estados[0].id_estado_pedido;

    // COMPROBAR SI YA ESTABA EN CONTACTO
    if (Number(pedido.id_estado_pedido) === Number(idEstadoContacto)) {
      await conexion.commit();

      return res.status(200).json({
        mensaje: "El pedido ya estaba en contacto.",
        estado: "En contacto",
      });
    }

    // SOLO SE PUEDE PASAR A CONTACTO DESDE EL CARRITO
    if (pedido.id_estado_pedido !== null) {
      await conexion.rollback();

      return res.status(400).json({
        mensaje: "Este pedido ya no está pendiente.",
      });
    }

    // OBTENER LOS VENDEDORES DEL PEDIDO
    const [vendedores] = await conexion.query(
      `
            SELECT DISTINCT
                pr.Id_usuario AS idVendedor
            FROM carrito_items ci

            INNER JOIN publicaciones_compra pc
                ON ci.id_publicacion_compra = pc.id_publicacion_compra

            INNER JOIN prendas pr
                ON pc.id_prenda = pr.id_prenda

            WHERE ci.Id_pedido = ?
        `,
      [idPedido],
    );

    if (vendedores.length === 0) {
      await conexion.rollback();

      return res.status(400).json({
        mensaje: "El pedido no contiene productos.",
      });
    }

    // ACTUALIZAR EL ESTADO
    const [resultado] = await conexion.query(
      `
            UPDATE pedidos
            SET id_estado_pedido = ?
            WHERE Id_pedido = ?
              AND id_comprador = ?
              AND id_estado_pedido IS NULL
        `,
      [idEstadoContacto, idPedido, idComprador],
    );

    if (resultado.affectedRows !== 1) {
      await conexion.rollback();

      return res.status(409).json({
        mensaje: "El pedido ya fue actualizado.",
      });
    }

    // CREAR UNA NOTIFICACIÓN PARA CADA VENDEDOR
    for (const vendedor of vendedores) {
      await conexion.query(
        `
                INSERT INTO \`notificaciónes\`
                    (Id_usuario, Id_usuario_origen, mensaje, fecha, visto)
                VALUES (?, ?, ?, NOW(), 0)
            `,
        [
          vendedor.idVendedor,
          idComprador,
          "¡Tenés una nueva compra! Un comprador quiere ponerse en contacto por tu publicación.",
        ],
      );
    }

    await conexion.commit();

    return res.status(200).json({
      mensaje: "El pedido ahora está en contacto.",
      estado: "En contacto",
    });
  } catch (error) {
    await conexion.rollback();

    console.error("Error al cambiar el estado:", error);

    return res.status(500).json({
      mensaje: "No se pudo actualizar el estado del pedido.",
    });
  } finally {
    conexion.release();
  }
});

// ELIMINAR TODOS LOS PEDIDOS PENDIENTES DEL USUARIO
// IMPORTANTE: ESTA RUTA DEBE ESTAR ANTES DE /:id
router.delete("/limpiar", async (req, res) => {
  const conexion = await db.getConnection();

  try {
    const idComprador = req.user.id;

    await conexion.beginTransaction();

    const [pedidos] = await conexion.query(
      `
            SELECT Id_pedido
            FROM pedidos
            WHERE id_comprador = ?
              AND id_estado_pedido IS NULL
            FOR UPDATE
        `,
      [idComprador],
    );

    if (pedidos.length === 0) {
      await conexion.commit();

      return res.status(200).json({
        mensaje: "No hay pedidos pendientes para eliminar.",
      });
    }

    const idsPedidos = pedidos.map((pedido) => pedido.Id_pedido);

    await conexion.query(
      `
            DELETE FROM carrito_items
            WHERE Id_pedido IN (?)
        `,
      [idsPedidos],
    );

    await conexion.query(
      `
            DELETE FROM pedidos
            WHERE Id_pedido IN (?)
              AND id_comprador = ?
              AND id_estado_pedido IS NULL
        `,
      [idsPedidos, idComprador],
    );

    await conexion.commit();

    return res.status(200).json({
      mensaje: "Se vació el carrito correctamente.",
      pedidosEliminados: pedidos.length,
    });
  } catch (error) {
    await conexion.rollback();

    console.error("Error al limpiar el carrito:", error);

    return res.status(500).json({
      mensaje: "No se pudo vaciar el carrito.",
    });
  } finally {
    conexion.release();
  }
});

// ELIMINAR UN PEDIDO DEL USUARIO LOGUEADO
router.delete("/:id", async (req, res) => {
  let conexion;

  try {
    const idPedido = req.params.id;
    const idComprador = req.user.id;

    conexion = await db.getConnection();

    await conexion.beginTransaction();

    const [pedidos] = await conexion.query(
      `SELECT id_estado_pedido
             FROM pedidos
             WHERE Id_pedido = ?
               AND id_comprador = ?
             FOR UPDATE`,
      [idPedido, idComprador],
    );

    if (pedidos.length === 0) {
      await conexion.rollback();

      return res.status(404).json({
        mensaje: "No se encontró el pedido.",
      });
    }

    if (pedidos[0].id_estado_pedido !== null) {
      await conexion.rollback();

      return res.status(400).json({
        mensaje: "No se puede eliminar un pedido que ya está en proceso.",
      });
    }

    await conexion.query(
      `DELETE FROM carrito_items
             WHERE Id_pedido = ?`,
      [idPedido],
    );

    await conexion.query(
      `DELETE FROM pedidos
             WHERE Id_pedido = ?
               AND id_comprador = ?`,
      [idPedido, idComprador],
    );

    await conexion.commit();

    return res.json({
      mensaje: "Pedido eliminado correctamente.",
    });
  } catch (error) {
    if (conexion) {
      await conexion.rollback();
    }

    console.error("Error al eliminar el pedido:", error);

    return res.status(500).json({
      mensaje: "Error al eliminar el pedido.",
    });
  } finally {
    if (conexion) {
      conexion.release();
    }
  }
});

module.exports = router;