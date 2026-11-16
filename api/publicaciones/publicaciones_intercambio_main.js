const router = require("express").Router();
const db = require("../../config/db");

router.get("/", (req, res) => {
    const {
        categoria,
        talle,
        temporada,
        estado,
        ocasion,
        genero,
        estadoMinimoAceptado,
        talleBuscado,
        colores = [],
        estilos = [],
        categoriasAceptadas = []
    } = req.query;

    const listaColores = Array.isArray(colores)
        ? colores
        : colores ? [colores] : [];

    const listaEstilos = Array.isArray(estilos)
        ? estilos
        : estilos ? [estilos] : [];

    const listaTiposAceptados = Array.isArray(categoriasAceptadas)
        ? categoriasAceptadas
        : categoriasAceptadas ? [categoriasAceptadas] : [];

    // FILTROS GENERALES
    const condiciones = [];
    const valores = [];

    if (categoria && categoria !== "TODAS") {
        condiciones.push("ca.categoria = ?");
        valores.push(categoria);
    }

    if (talle && talle !== "TODOS") {
        condiciones.push("ta.talla = ?");
        valores.push(talle);
    }

    if (temporada && temporada !== "TODAS") {
        condiciones.push("te.temporada = ?");
        valores.push(temporada);
    }

    if (estado && estado !== "TODOS") {
        condiciones.push("ep.estado_prenda = ?");
        valores.push(estado);
    }

    if (ocasion && ocasion !== "TODOS") {
        condiciones.push("oc.ocacion = ?");
        valores.push(ocasion);
    }

    if (genero && genero !== "TODOS") {
        condiciones.push("g.genero = ?");
        valores.push(genero);
    }

    // FILTRO POR COLORES
    if (listaColores.length > 0) {
        condiciones.push("co.color IN (?)");
        valores.push(listaColores);
    }

    // FILTRO POR ESTILOS
    if (listaEstilos.length > 0) {
        condiciones.push(`
            EXISTS (
                SELECT 1
                FROM prendas_estilos pe
                INNER JOIN estilos e
                    ON pe.id_estilo = e.id_estilo
                WHERE pe.id_prenda = p.id_prenda
                AND e.estilo IN (?)
            )
        `);

        valores.push(listaEstilos);
    }

    // FILTROS ESPECÍFICOS DE INTERCAMBIO
    if (estadoMinimoAceptado) {
        condiciones.push("p.id_estado_prenda <= ?");
        valores.push(Number(estadoMinimoAceptado));
    }

    if (talleBuscado && talleBuscado !== "TODOS") {
        condiciones.push("tb.talla = ?");
        valores.push(talleBuscado);
    }

    if (listaTiposAceptados.length > 0) {
        condiciones.push(`
            EXISTS (
                SELECT 1
                FROM categorias_aceptadas ca2
                INNER JOIN categorias c2
                    ON ca2.id_categoria = c2.id_categoria
                WHERE ca2.id_publicacion_intercambio = pi.Id_publicacion_intercambio
                AND c2.categoria IN (?)
            )
        `);

        valores.push(listaTiposAceptados);
    }

    let where = "";

    if (condiciones.length > 0) {
        where = `AND ${condiciones.join(" AND ")}`;
    }

    // CONSULTA PRINCIPAL
    const consulta = `
        SELECT
            pi.Id_publicacion_intercambio AS id,
            'intercambio' AS tipo,
            NULL AS precio,
            tb.talla AS talleBuscado,
            ema.estado_prenda AS estadoMinimoAceptado,

            p.id_prenda AS idPrenda,
            p.nombre,
            ta.talla AS talle,
            ep.estado_prenda AS estado,
            NULL AS stock,
            p.privacidad,
            p.imagen,

            u.Id_usuario AS idUsuario,
            u.nombre AS usuario,

            g.genero,
            ca.id_categoria AS idCategoria,
            ca.categoria AS prenda,
            co.color AS color,
            co.codigo AS codigoColor,
            te.temporada,
            oc.ocacion AS ocasion

        FROM publicaciones_intercambio pi

        INNER JOIN prendas p
            ON pi.id_prenda = p.id_prenda

        INNER JOIN usuarios u
            ON p.Id_usuario = u.Id_usuario

        LEFT JOIN categorias ca
            ON p.id_categoria = ca.id_categoria

        LEFT JOIN colores co
            ON p.id_color = co.id_color

        LEFT JOIN tallas ta
            ON p.id_talla = ta.id_talla

        LEFT JOIN estados_prenda ep
            ON p.id_estado_prenda = ep.id_estado_prenda

        LEFT JOIN temporadas te
            ON p.id_temporada = te.id_temporada

        LEFT JOIN generos g
            ON p.id_genero = g.id_genero

        LEFT JOIN ocaciones oc
            ON p.id_ocacion = oc.id_ocacion

        LEFT JOIN tallas tb
            ON pi.talle_buscado = tb.id_talla

        LEFT JOIN estados_prenda ema
            ON pi.estado_MA = ema.id_estado_prenda

        WHERE p.privacidad = 1
        ${where}

        ORDER BY pi.Id_publicacion_intercambio DESC
    `;

    // EJECUTAR CONSULTA
    db.query(consulta, valores)
    .then(([publicaciones]) => {
        res.json({ publicaciones });
    })
    .catch((error) => {
        console.error("Error al obtener publicaciones de intercambio:", error);

        res.status(500).json({
            mensaje: "Error al obtener las publicaciones de intercambio"
        });
    });
});

router.get("/:id", (req, res) => {
    const { id } = req.params;

    const consulta = `
        SELECT
            pi.Id_publicacion_intercambio AS id,
            'intercambio' AS tipo,
            NULL AS precio,
            tb.talla AS talleBuscado,
            ema.estado_prenda AS estadoMinimoAceptado,

            (
                SELECT JSON_ARRAYAGG(c2.categoria)
                FROM categorias_aceptadas ca2
                INNER JOIN categorias c2
                    ON ca2.id_categoria = c2.id_categoria
                WHERE ca2.id_publicacion_intercambio = pi.Id_publicacion_intercambio
            ) AS tiposAceptados,

            (
                SELECT JSON_ARRAYAGG(e.estilo)
                FROM prendas_estilos pe
                INNER JOIN estilos e
                    ON pe.id_estilo = e.id_estilo
                WHERE pe.id_prenda = p.id_prenda
            ) AS estilos,

            JSON_ARRAY(
                JSON_OBJECT(
                    'color', co.color,
                    'codigoColor', co.codigo
                )
            ) AS colores,

            JSON_ARRAY(tb.talla) AS tallesBuscados,

            p.id_prenda AS idPrenda,
            p.nombre,
            p.imagen,
            p.privacidad,

            ta.talla AS talle,
            ep.estado_prenda AS estado,
            g.genero,
            ca.id_categoria AS idCategoria,
            ca.categoria AS prenda,
            co.color AS color,
            co.codigo AS codigoColor,
            te.temporada,
            oc.ocacion AS ocasion,

            u.Id_usuario AS idUsuario,
            u.nombre AS usuario,
            u.foto_perfil AS fotoPerfil

        FROM publicaciones_intercambio pi

        INNER JOIN prendas p
            ON pi.id_prenda = p.id_prenda

        INNER JOIN usuarios u
            ON p.Id_usuario = u.Id_usuario

        LEFT JOIN categorias ca
            ON p.id_categoria = ca.id_categoria

        LEFT JOIN colores co
            ON p.id_color = co.id_color

        LEFT JOIN tallas ta
            ON p.id_talla = ta.id_talla

        LEFT JOIN estados_prenda ep
            ON p.id_estado_prenda = ep.id_estado_prenda

        LEFT JOIN temporadas te
            ON p.id_temporada = te.id_temporada

        LEFT JOIN generos g
            ON p.id_genero = g.id_genero

        LEFT JOIN ocaciones oc
            ON p.id_ocacion = oc.id_ocacion

        LEFT JOIN tallas tb
            ON pi.talle_buscado = tb.id_talla

        LEFT JOIN estados_prenda ema
            ON pi.estado_MA = ema.id_estado_prenda

        WHERE pi.Id_publicacion_intercambio = ?
        AND p.privacidad = 1
    `;

    db.query(consulta, [id])
    .then(([resultados]) => {
        if (resultados.length === 0) {
            return res.status(404).json({
                mensaje: "Publicación no encontrada"
            });
        }

        res.json({ publicacion: resultados[0] });
    })
    .catch((error) => {
        console.error("Error al obtener detalle de intercambio:", error);

        res.status(500).json({
            mensaje: "Error al obtener el detalle de la publicación"
        });
    });
});

module.exports = router;
