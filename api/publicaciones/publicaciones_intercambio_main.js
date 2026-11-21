const router = require("express").Router();
const db = require("../../config/db");
const middlewareSeg = require("../middlewares/middlewareSeg");

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
    categoriasAceptadas = [],
  } = req.query;

  const listaColores = Array.isArray(colores)
    ? colores
    : colores
      ? [colores]
      : [];

  const listaEstilos = Array.isArray(estilos)
    ? estilos
    : estilos
      ? [estilos]
      : [];

  const listaTiposAceptados = Array.isArray(categoriasAceptadas)
    ? categoriasAceptadas
    : categoriasAceptadas
      ? [categoriasAceptadas]
      : [];

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
    condiciones.push(`
    (
      pi.estado_MA IS NULL
      OR p.id_estado_prenda <= ?
    )
  `);
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
        mensaje: "Error al obtener las publicaciones de intercambio",
      });
    });
});

router.get("/mis", middlewareSeg, async (req, res) => {
  const idUsuario = req.user.id;

  try {
    const consulta = `
  SELECT
    pi.*,
    p.nombre,
    p.imagen,
    p.privacidad,
    ca.categoria AS categoria,
    ta.talla AS talle,
    te.temporada,
    ep.estado_prenda AS estado,
    oc.ocacion AS ocasion,
    g.genero,
    co.color AS color,
    ema.estado_prenda AS estadoMinimoAceptado,

    (
  SELECT JSON_ARRAYAGG(e.estilo)
  FROM prendas_estilos pe
  INNER JOIN estilos e ON pe.id_estilo = e.id_estilo
  WHERE pe.id_prenda = p.id_prenda
) AS estilos,

(
  SELECT JSON_ARRAYAGG(catAceptada.categoria)
  FROM categorias_aceptadas ca
  INNER JOIN categorias catAceptada
    ON ca.id_categoria = catAceptada.id_categoria
  WHERE ca.id_publicacion_intercambio = pi.Id_publicacion_intercambio
) AS tiposAceptados

  FROM publicaciones_intercambio pi
  INNER JOIN prendas p ON pi.id_prenda = p.id_prenda
  LEFT JOIN categorias ca ON p.id_categoria = ca.id_categoria
  LEFT JOIN tallas ta ON p.id_talla = ta.id_talla
  LEFT JOIN temporadas te ON p.id_temporada = te.id_temporada
  LEFT JOIN estados_prenda ep ON p.id_estado_prenda = ep.id_estado_prenda
  LEFT JOIN ocaciones oc ON p.id_ocacion = oc.id_ocacion
  LEFT JOIN generos g ON p.id_genero = g.id_genero
  LEFT JOIN colores co ON p.id_color = co.id_color
  LEFT JOIN estados_prenda ema ON pi.estado_MA = ema.id_estado_prenda

  WHERE p.id_usuario = ?
  ORDER BY pi.id_publicacion_intercambio DESC
`;

    const [publicaciones] = await db.query(consulta, [idUsuario]);

    res.json(publicaciones);
  } catch (error) {
    console.error("Error al cargar mis intercambios:", error);
    console.log(error.sqlMessage);
    console.log(error.message);
    res.status(500).json({
      mensaje: error.sqlMessage || error.message,
    });
  }
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
          mensaje: "Publicación no encontrada",
        });
      }

      res.json({ publicacion: resultados[0] });
    })
    .catch((error) => {
      console.error("Error al obtener detalle de intercambio:", error);

      res.status(500).json({
        mensaje: "Error al obtener el detalle de la publicación",
      });
    });
});

router.post("/", middlewareSeg, async (req, res) => {
  const idUsuario = req.user.id;

  try {
    const {
      id_prenda,
      estado_MA,
      talle_buscado,
      categoriasAceptadas = [],
    } = req.body;

    if (
      !Number.isInteger(Number(id_prenda)) ||
      (estado_MA !== null && !Number.isInteger(Number(estado_MA))) ||
      !Number.isInteger(Number(talle_buscado)) ||
      !Array.isArray(categoriasAceptadas)
    ) {
      return res.status(400).json({
        mensaje: "Los datos de la publicación no son válidos",
      });
    }

    // Comprobar que la prenda pertenece al usuario
    const [prendas] = await db.query(
      `SELECT id_prenda
       FROM prendas
       WHERE id_prenda = ? AND Id_usuario = ?`,
      [id_prenda, idUsuario],
    );

    if (prendas.length === 0) {
      return res.status(403).json({
        mensaje: "No podés publicar una prenda que no te pertenece",
      });
    }

    // Normalizar y quitar categorías repetidas
    const categorias = [...new Set(categoriasAceptadas.map(Number))];

    if (!categorias.every((id) => Number.isInteger(id) && id > 0)) {
      return res.status(400).json({
        mensaje: "Las categorías aceptadas no son válidas",
      });
    }

    // Crear publicación
    const [resultado] = await db.query(
      `INSERT INTO publicaciones_intercambio
       (id_prenda, estado_MA, talle_buscado)
       VALUES (?, ?, ?)`,
      [id_prenda, estado_MA, talle_buscado],
    );

    const idPublicacion = resultado.insertId;

    // Guardar las categorías aceptadas
    if (categorias.length > 0) {
      const valores = categorias.map((idCategoria) => [
        idCategoria,
        idPublicacion,
      ]);

      await db.query(
        `INSERT INTO categorias_aceptadas
         (id_categoria, id_publicacion_intercambio)
         VALUES ?`,
        [valores],
      );
    }

    res.status(201).json({
      mensaje: "Publicación de intercambio creada correctamente",
      id: idPublicacion,
    });
  } catch (error) {
    console.error("Error al crear publicación de intercambio:", error);

    res.status(500).json({
      mensaje: "Error al crear la publicación",
    });
  }
});

router.put("/:id", middlewareSeg, async (req, res) => {
  const idUsuario = req.user.id;
  const idPublicacion = req.params.id;

  try {
    const { estado_MA, talle_buscado, categoriasAceptadas = [] } = req.body;

    if (
      (estado_MA !== null && !Number.isInteger(Number(estado_MA))) ||
      !Number.isInteger(Number(talle_buscado)) ||
      !Array.isArray(categoriasAceptadas)
    ) {
      return res.status(400).json({
        mensaje: "Los datos ingresados no son válidos",
      });
    }

    // Comprobar que la publicación pertenece al usuario
    const [publicaciones] = await db.query(
      `SELECT pi.Id_publicacion_intercambio
       FROM publicaciones_intercambio pi
       INNER JOIN prendas p ON pi.id_prenda = p.id_prenda
       WHERE pi.Id_publicacion_intercambio = ?
       AND p.Id_usuario = ?`,
      [idPublicacion, idUsuario],
    );

    if (publicaciones.length === 0) {
      return res.status(404).json({
        mensaje: "No se encontró la publicación",
      });
    }

    const categorias = [...new Set(categoriasAceptadas.map(Number))];

    if (!categorias.every((id) => Number.isInteger(id) && id > 0)) {
      return res.status(400).json({
        mensaje: "Las categorías aceptadas no son válidas",
      });
    }

    // Actualizar los datos de la publicación
    await db.query(
      `UPDATE publicaciones_intercambio
       SET estado_MA = ?, talle_buscado = ?
       WHERE Id_publicacion_intercambio = ?`,
      [estado_MA, talle_buscado, idPublicacion],
    );

    // Eliminar las categorías anteriores
    await db.query(
      `DELETE FROM categorias_aceptadas
       WHERE id_publicacion_intercambio = ?`,
      [idPublicacion],
    );

    // Guardar las nuevas categorías
    if (categorias.length > 0) {
      const valores = categorias.map((idCategoria) => [
        idCategoria,
        idPublicacion,
      ]);

      await db.query(
        `INSERT INTO categorias_aceptadas
         (id_categoria, id_publicacion_intercambio)
         VALUES ?`,
        [valores],
      );
    }

    res.json({
      mensaje: "Publicación de intercambio modificada correctamente",
    });
  } catch (error) {
    console.error("Error al modificar publicación de intercambio:", error);

    res.status(500).json({
      mensaje: "Error al modificar la publicación",
    });
  }
});

router.delete("/:id", middlewareSeg, async (req, res) => {
  const idUsuario = req.user.id;
  const idPublicacion = req.params.id;

  try {
    // Comprobar que la publicación pertenece al usuario
    const [publicaciones] = await db.query(
      `SELECT pi.Id_publicacion_intercambio
       FROM publicaciones_intercambio pi
       INNER JOIN prendas p ON pi.id_prenda = p.id_prenda
       WHERE pi.Id_publicacion_intercambio = ?
       AND p.Id_usuario = ?`,
      [idPublicacion, idUsuario],
    );

    if (publicaciones.length === 0) {
      return res.status(404).json({
        mensaje: "No se encontró la publicación",
      });
    }

    // Eliminar primero las categorías relacionadas
    await db.query(
      `DELETE FROM categorias_aceptadas
       WHERE id_publicacion_intercambio = ?`,
      [idPublicacion],
    );

    // Eliminar la publicación
    await db.query(
      `DELETE FROM publicaciones_intercambio
       WHERE Id_publicacion_intercambio = ?`,
      [idPublicacion],
    );

    res.json({
      mensaje: "Publicación de intercambio eliminada correctamente",
    });
  } catch (error) {
    console.error("Error al eliminar publicación de intercambio:", error);

    res.status(500).json({
      mensaje: "Error al eliminar la publicación",
    });
  }
});

module.exports = router;
