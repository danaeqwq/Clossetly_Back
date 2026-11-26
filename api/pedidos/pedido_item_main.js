const router = require("express").Router();
const db = require("../../config/db");

// OBTENER LOS ITEMS DE LOS PEDIDOS DEL USUARIO LOGUEADO
router.get("/", async (req, res) => {
    try {
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

        const [resultados] = await db.query(consulta, [idComprador]);

        const pedidoItems = resultados.map((fila) => ({
            id: fila.id,
            idPedido: fila.idPedido,
            idPublicacion: fila.idPublicacion,
            idPrenda: fila.idPrenda,
            nombre: fila.nombre,
            imagen: fila.imagen,
            precio: fila.precio,
            cantidad: fila.cantidad,
            stock: fila.stock
        }));

        return res.json({ pedidoItems });

    } catch (error) {
        console.error("Error al obtener los items de los pedidos:", error);

        return res.status(500).json({
            mensaje: "Error al obtener los productos de los pedidos"
        });
    }
});

// AGREGAR UNA PUBLICACIÓN AL CARRITO
router.post("/", async (req, res) => {
    const conexion = await db.getConnection();

    try {
        const idComprador = req.user.id;
        const { idPublicacion } = req.body;

        if (!idPublicacion) {
            return res.status(400).json({
                mensaje: "No se recibió la publicación."
            });
        }

        await conexion.beginTransaction();

        // Bloqueamos al comprador para evitar crear dos pedidos
        // pendientes del mismo vendedor simultáneamente.
        await conexion.query(
            "SELECT Id_usuario FROM usuarios WHERE Id_usuario = ? FOR UPDATE",
            [idComprador]
        );

        // Buscamos la publicación y obtenemos su vendedor desde prendas.
        const [publicaciones] = await conexion.query(`
            SELECT
                pc.id_publicacion_compra AS idPublicacion,
                pc.precio_unitario AS precio,
                pc.stock AS stock,
                pr.Id_usuario AS idVendedor
            FROM publicaciones_compra pc
            INNER JOIN prendas pr
                ON pc.id_prenda = pr.id_prenda
            WHERE pc.id_publicacion_compra = ?
            FOR UPDATE
        `, [idPublicacion]);

        if (publicaciones.length === 0) {
            await conexion.rollback();
            return res.status(404).json({
                mensaje: "La publicación no existe."
            });
        }

        const publicacion = publicaciones[0];

        if (publicacion.stock <= 0) {
            await conexion.rollback();
            return res.status(400).json({
                mensaje: "Esta publicación no tiene stock disponible."
            });
        }

        if (Number(publicacion.idVendedor) === Number(idComprador)) {
            await conexion.rollback();
            return res.status(400).json({
                mensaje: "No podés agregar tu propia publicación al carrito."
            });
        }

        // Buscamos un pedido pendiente del mismo comprador y vendedor.
        const [pedidos] = await conexion.query(`
            SELECT p.Id_pedido AS id
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
            LIMIT 1
            FOR UPDATE
        `, [idComprador, publicacion.idVendedor]);

        let idPedido;

        if (pedidos.length > 0) {
            // Ya existe un pedido pendiente para ese vendedor.
            idPedido = pedidos[0].id;
        } else {
            // Creamos un pedido nuevo sin estado.
            const [nuevoPedido] = await conexion.query(`
                INSERT INTO pedidos
                    (id_comprador, \`sub total\`, id_estado_pedido)
                VALUES (?, 0, NULL)
            `, [idComprador]);

            idPedido = nuevoPedido.insertId;
        }

        // Comprobamos si la publicación ya está en ese pedido.
        const [items] = await conexion.query(`
            SELECT Id_carritoItem AS id, cantidad
            FROM carrito_items
            WHERE Id_pedido = ?
              AND id_publicacion_compra = ?
            FOR UPDATE
        `, [idPedido, idPublicacion]);

        let idCarritoItem;
        let cantidad;

        if (items.length > 0) {
            cantidad = items[0].cantidad + 1;

            if (cantidad > publicacion.stock) {
                await conexion.rollback();
                return res.status(400).json({
                    mensaje: "No hay suficiente stock disponible."
                });
            }

            idCarritoItem = items[0].id;

            await conexion.query(`
                UPDATE carrito_items
                SET cantidad = ?
                WHERE Id_carritoItem = ?
            `, [cantidad, idCarritoItem]);

        } else {
            cantidad = 1;

            const [nuevoItem] = await conexion.query(`
                INSERT INTO carrito_items
                    (Id_pedido, id_publicacion_compra, cantidad)
                VALUES (?, ?, ?)
            `, [idPedido, idPublicacion, cantidad]);

            idCarritoItem = nuevoItem.insertId;
        }

        // Recalculamos el subtotal del pedido.
        await conexion.query(`
            UPDATE pedidos
            SET \`sub total\` = (
                SELECT COALESCE(SUM(ci.cantidad * pc.precio_unitario), 0)
                FROM carrito_items ci
                INNER JOIN publicaciones_compra pc
                    ON ci.id_publicacion_compra = pc.id_publicacion_compra
                WHERE ci.Id_pedido = ?
            )
            WHERE Id_pedido = ?
        `, [idPedido, idPedido]);

        await conexion.commit();

        res.status(201).json({
            mensaje: "¡Producto agregado al carrito!",
            idPedido,
            idCarritoItem,
            cantidad
        });

    } catch (error) {
        await conexion.rollback();

        console.error("Error al agregar al carrito:", error);

        res.status(500).json({
            mensaje: "Error al agregar el producto al carrito."
        });

    } finally {
        conexion.release();
    }
});

// MODIFICAR CANTIDAD DE UN PRODUCTO DEL CARRITO
router.patch("/:id", async (req, res) => {
    let conexion;

    try {
        const idCarritoItem = req.params.id;
        const idComprador = req.user.id;
        const cantidad = Number(req.body.cantidad);

        if (!Number.isInteger(cantidad) || cantidad < 1) {
            return res.status(400).json({
                mensaje: "La cantidad debe ser un número entero mayor a cero"
            });
        }

        conexion = await db.getConnection();
        await conexion.beginTransaction();

        // Verificar que el producto pertenezca a un pedido del comprador
        const [items] = await conexion.query(`
            SELECT
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
                AND p.id_estado_pedido IS NULL
            FOR UPDATE
        `, [idCarritoItem, idComprador]);

        if (items.length === 0) {
            await conexion.rollback();

            return res.status(404).json({
                mensaje: "No se encontró el producto en tu carrito"
            });
        }

        const item = items[0];

        // Verificar el stock disponible
        if (cantidad > item.stock) {
            await conexion.rollback();

            return res.status(400).json({
                mensaje: "No hay suficiente stock disponible",
                stock: item.stock
            });
        }

        // Actualizar cantidad
        await conexion.query(`
            UPDATE carrito_items
            SET cantidad = ?
            WHERE Id_carritoItem = ?
        `, [cantidad, idCarritoItem]);

        // Recalcular subtotal del pedido
        const [resultado] = await conexion.query(`
            SELECT COALESCE(
                SUM(ci.cantidad * pc.precio_unitario), 0
            ) AS subtotal
            FROM carrito_items ci
            INNER JOIN publicaciones_compra pc
                ON ci.id_publicacion_compra = pc.id_publicacion_compra
            WHERE ci.Id_pedido = ?
        `, [item.Id_pedido]);

        await conexion.query(`
            UPDATE pedidos
            SET \`sub total\` = ?
            WHERE Id_pedido = ?
        `, [resultado[0].subtotal, item.Id_pedido]);

        await conexion.commit();

        return res.json({
            mensaje: "Cantidad y subtotal actualizados correctamente",
            cantidad: cantidad,
            subtotal: resultado[0].subtotal
        });

    } catch (error) {
        if (conexion) await conexion.rollback();

        console.error("Error al modificar el carrito:", error);

        return res.status(500).json({
            mensaje: "Error al modificar el producto del carrito"
        });

    } finally {
        if (conexion) conexion.release();
    }
});

// ELIMINAR UN PRODUCTO DEL CARRITO
router.delete("/:id", async (req, res) => {
    let conexion;

    try {
        const idCarritoItem = req.params.id;
        const idComprador = req.user.id;

        conexion = await db.getConnection();
        await conexion.beginTransaction();

        // Verificar que el producto pertenezca al comprador
        const [items] = await conexion.query(`
            SELECT
                ci.Id_carritoItem,
                ci.Id_pedido
            FROM carrito_items ci
            INNER JOIN pedidos p
                ON ci.Id_pedido = p.Id_pedido
            WHERE ci.Id_carritoItem = ?
                AND p.id_comprador = ?
                AND p.id_estado_pedido IS NULL
            FOR UPDATE
        `, [idCarritoItem, idComprador]);

        if (items.length === 0) {
            await conexion.rollback();

            return res.status(404).json({
                mensaje: "No se encontró el producto en tu carrito"
            });
        }

        const idPedido = items[0].Id_pedido;

        // Eliminar producto
        await conexion.query(`
            DELETE FROM carrito_items
            WHERE Id_carritoItem = ?
        `, [idCarritoItem]);

        // Recalcular subtotal del pedido
        const [resultado] = await conexion.query(`
            SELECT COALESCE(
                SUM(ci.cantidad * pc.precio_unitario), 0
            ) AS subtotal
            FROM carrito_items ci
            INNER JOIN publicaciones_compra pc
                ON ci.id_publicacion_compra = pc.id_publicacion_compra
            WHERE ci.Id_pedido = ?
        `, [idPedido]);

        await conexion.query(`
            UPDATE pedidos
            SET \`sub total\` = ?
            WHERE Id_pedido = ?
        `, [resultado[0].subtotal, idPedido]);

        await conexion.commit();

        return res.json({
            mensaje: "Producto eliminado correctamente",
            subtotal: resultado[0].subtotal
        });

    } catch (error) {
        if (conexion) await conexion.rollback();

        console.error("Error al eliminar producto del carrito:", error);

        return res.status(500).json({
            mensaje: "Error al eliminar el producto del carrito"
        });

    } finally {
        if (conexion) conexion.release();
    }
});

module.exports = router;