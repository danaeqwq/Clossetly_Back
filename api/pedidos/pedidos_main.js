const router = require("express").Router();
const db = require("../../config/db");

// OBTENER TODOS LOS PEDIDOS AGRUPADOS
router.get("/", (req, res) => {

    const consulta = `
        SELECT
            p.Id_pedido AS id,
            p.id_comprador AS idComprador,
            p.id_vendedor AS idVendedor,
            p.\`sub total\` AS subtotal,

            ep.estado AS estado,
            ep.icon AS iconoEstado,

            u.nombre AS usuario,
            u.\`teléfono\` AS telefono,
            u.foto_perfil AS imagenVendedora,

            ci.Id_carritoItem AS idCarritoItem,
            ci.cantidad AS cantidad,

            pc.id_publicacion_compra AS idPublicacion,
            pc.precio_unitario AS precio,
            pc.stock AS stock,

            pr.id_prenda AS idPrenda,
            pr.nombre AS nombre,
            pr.imagen AS imagen

        FROM pedidos p

        INNER JOIN usuarios u
            ON p.id_vendedor = u.Id_usuario

        INNER JOIN estados_pedidos ep
            ON p.id_estado_pedido = ep.id_estado_pedido

        INNER JOIN carrito_items ci
            ON p.Id_pedido = ci.Id_pedido

        INNER JOIN publicaciones_compra pc
            ON ci.id_publicacion_compra = pc.id_publicacion_compra

        INNER JOIN prendas pr
            ON pc.id_prenda = pr.id_prenda

        ORDER BY p.Id_pedido DESC
    `;

    db.query(consulta, (error, resultados) => {
        if (error) {
            console.error("Error al obtener pedidos:", error);
            return res.status(500).json({
                mensaje: "Error al obtener los pedidos"
            });
        }

        const pedidos = [];

        resultados.forEach((fila) => {

            let pedido = pedidos.find(
                (p) => p.id === fila.id
            );

            if (!pedido) {
                pedido = {
                    id: fila.id,
                    idComprador: fila.idComprador,
                    idVendedor: fila.idVendedor,
                    usuario: fila.usuario,
                    telefono: fila.telefono,
                    imagenVendedora: fila.imagenVendedora,
                    estado: fila.estado,
                    iconoEstado: fila.iconoEstado,
                    subtotal: fila.subtotal,
                    productos: []
                };

                pedidos.push(pedido);
            }

            pedido.productos.push({
                id: fila.idCarritoItem,
                idPublicacion: fila.idPublicacion,
                idPrenda: fila.idPrenda,
                nombre: fila.nombre,
                imagen: fila.imagen,
                precio: fila.precio,
                cantidad: fila.cantidad,
                stock: fila.stock
            });
        });

        res.json({ pedidos });
    });
});

module.exports = router;