const router = require("express").Router();
const db = require("../../config/db");

// OBTENER PUBLICACIONES DE INTERCAMBIO

router.get("/", (req, res) => {
  const idUsuario = req.user.id;

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

  if (listaColores.length > 0) {
    condiciones.push("co.color IN (?)");
    valores.push(listaColores);
  }

  if (listaEstilos.length > 0) {
    condiciones.push(`
      EXISTS (
        SELECT 1
        FROM prendas_estilos pe
        INNER JOIN estilos e ON pe.id_estilo = e.id_estilo
        WHERE pe.id_prenda = p.id_prenda
        AND e.estilo IN (?)
      )
    `);
    valores.push(listaEstilos);
  }

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
        INNER JOIN categorias c2 ON ca2.id_categoria = c2.id_categoria
        WHERE ca2.id_publicacion_intercambio = pi.Id_publicacion_intercambio
        AND c2.categoria IN (?)
      )
    `);
    valores.push(listaTiposAceptados);
  }

  const where =
    condiciones.length > 0 ? `AND ${condiciones.join(" AND ")}` : "";

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
    INNER JOIN prendas p ON pi.id_prenda = p.id_prenda
    INNER JOIN usuarios u ON p.Id_usuario = u.Id_usuario

    LEFT JOIN categorias ca ON p.id_categoria = ca.id_categoria
    LEFT JOIN colores co ON p.id_color = co.id_color
    LEFT JOIN tallas ta ON p.id_talla = ta.id_talla
    LEFT JOIN estados_prenda ep ON p.id_estado_prenda = ep.id_estado_prenda
    LEFT JOIN temporadas te ON p.id_temporada = te.id_temporada
    LEFT JOIN generos g ON p.id_genero = g.id_genero
    LEFT JOIN ocaciones oc ON p.id_ocacion = oc.id_ocacion
    LEFT JOIN tallas tb ON pi.talle_buscado = tb.id_talla
    LEFT JOIN estados_prenda ema ON pi.estado_MA = ema.id_estado_prenda

    WHERE p.privacidad = 1
    AND p.Id_usuario <> ?
    ${where}

    ORDER BY pi.Id_publicacion_intercambio DESC
  `;

  db.query(consulta, [idUsuario, ...valores])
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

// OBTENER MIS PUBLICACIONES

router.get("/mis", (req, res) => {
  const idUsuario = req.user.id;

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

    WHERE p.Id_usuario = ?
    ORDER BY pi.id_publicacion_intercambio DESC
  `;

  db.query(consulta, [idUsuario])
    .then(([publicaciones]) => {
      res.json({ publicaciones });
    })
    .catch((error) => {
      console.error("Error al obtener mis intercambios:", error);

      res.status(500).json({
        mensaje: "Error al obtener tus publicaciones de intercambio",
      });
    });
});

// OBTENER DETALLE DE UNA PUBLICACIÓN

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
        INNER JOIN categorias c2 ON ca2.id_categoria = c2.id_categoria
        WHERE ca2.id_publicacion_intercambio = pi.Id_publicacion_intercambio
      ) AS tiposAceptados,

      (
        SELECT JSON_ARRAYAGG(e.estilo)
        FROM prendas_estilos pe
        INNER JOIN estilos e ON pe.id_estilo = e.id_estilo
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
    INNER JOIN prendas p ON pi.id_prenda = p.id_prenda
    INNER JOIN usuarios u ON p.Id_usuario = u.Id_usuario

    LEFT JOIN categorias ca ON p.id_categoria = ca.id_categoria
    LEFT JOIN colores co ON p.id_color = co.id_color
    LEFT JOIN tallas ta ON p.id_talla = ta.id_talla
    LEFT JOIN estados_prenda ep ON p.id_estado_prenda = ep.id_estado_prenda
    LEFT JOIN temporadas te ON p.id_temporada = te.id_temporada
    LEFT JOIN generos g ON p.id_genero = g.id_genero
    LEFT JOIN ocaciones oc ON p.id_ocacion = oc.id_ocacion
    LEFT JOIN tallas tb ON pi.talle_buscado = tb.id_talla
    LEFT JOIN estados_prenda ema ON pi.estado_MA = ema.id_estado_prenda

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

// CREAR PUBLICACIÓN DE INTERCAMBIO

router.post("/", (req, res) => {
  const idUsuario = req.user.id;

  const {
    id_prenda,
    estado_MA,
    talle_buscado,
    categoriasAceptadas = [],
  } = req.body;

  const estadoMA =
    estado_MA === null || estado_MA === undefined || estado_MA === ""
      ? null
      : Number(estado_MA);

  if (
    !Number.isInteger(Number(id_prenda)) ||
    (estadoMA !== null && !Number.isInteger(estadoMA)) ||
    !Number.isInteger(Number(talle_buscado)) ||
    !Array.isArray(categoriasAceptadas)
  ) {
    return res.status(400).json({
      mensaje: "Los datos de la publicación no son válidos",
    });
  }

  const categorias = [...new Set(categoriasAceptadas.map(Number))];

  if (!categorias.every((id) => Number.isInteger(id) && id > 0)) {
    return res.status(400).json({
      mensaje: "Las categorías aceptadas no son válidas",
    });
  }

  db.query(
    `SELECT id_prenda
     FROM prendas
     WHERE id_prenda = ? AND Id_usuario = ?`,
    [id_prenda, idUsuario],
  )
    .then(([prendas]) => {
      if (prendas.length === 0) {
        res.status(403).json({
          mensaje: "No podés publicar una prenda que no te pertenece",
        });
        return;
      }

      return db.query(
        `SELECT id_prenda FROM publicaciones_compra
         WHERE id_prenda = ?
         UNION
         SELECT id_prenda FROM publicaciones_intercambio
         WHERE id_prenda = ?`,
        [id_prenda, id_prenda],
      );
    })
    .then((resultado) => {
      if (res.headersSent) return;

      if (resultado.length > 0) {
        res.status(409).json({
          mensaje: "Esta prenda ya tiene una publicación",
        });
        return;
      }

      return db.query(
        `INSERT INTO publicaciones_intercambio
         (id_prenda, estado_MA, talle_buscado)
         VALUES (?, ?, ?)`,
        [id_prenda, estadoMA, talle_buscado],
      );
    })
    .then((resultado) => {
      if (res.headersSent) return;

      const idPublicacion = resultado.insertId;

      if (categorias.length === 0) {
        res.status(201).json({
          mensaje: "Publicación de intercambio creada correctamente",
          id: idPublicacion,
        });
        return;
      }

      const valores = categorias.map((id) => [id, idPublicacion]);

      return db
        .query(
          `INSERT INTO categorias_aceptadas
         (id_categoria, id_publicacion_intercambio)
         VALUES ?`,
          [valores],
        )
        .then(() => {
          res.status(201).json({
            mensaje: "Publicación de intercambio creada correctamente",
            id: idPublicacion,
          });
        });
    })
    .catch((error) => {
      console.error("Error al crear publicación de intercambio:", error);

      if (!res.headersSent) {
        res.status(500).json({
          mensaje: "Error al crear la publicación",
        });
      }
    });
});

// MODIFICAR PUBLICACIÓN DE INTERCAMBIO

router.put("/:id", (req, res) => {
  const idUsuario = req.user.id;
  const idPublicacion = req.params.id;

  const { estado_MA, talle_buscado, categoriasAceptadas = [] } = req.body;

  const estadoMA =
    estado_MA === null || estado_MA === undefined || estado_MA === ""
      ? null
      : Number(estado_MA);

  if (
    (estadoMA !== null && !Number.isInteger(estadoMA)) ||
    !Number.isInteger(Number(talle_buscado)) ||
    !Array.isArray(categoriasAceptadas)
  ) {
    return res.status(400).json({
      mensaje: "Los datos ingresados no son válidos",
    });
  }

  const categorias = [...new Set(categoriasAceptadas.map(Number))];

  if (!categorias.every((id) => Number.isInteger(id) && id > 0)) {
    return res.status(400).json({
      mensaje: "Las categorías aceptadas no son válidas",
    });
  }

  db.query(
    `SELECT pi.Id_publicacion_intercambio
     FROM publicaciones_intercambio pi
     INNER JOIN prendas p ON pi.id_prenda = p.id_prenda
     WHERE pi.Id_publicacion_intercambio = ?
     AND p.Id_usuario = ?`,
    [idPublicacion, idUsuario],
  )
    .then(([publicaciones]) => {
      if (publicaciones.length === 0) {
        res.status(404).json({
          mensaje: "No se encontró la publicación",
        });
        return;
      }

      return db.query(
        `UPDATE publicaciones_intercambio
         SET estado_MA = ?, talle_buscado = ?
         WHERE Id_publicacion_intercambio = ?`,
        [estadoMA, talle_buscado, idPublicacion],
      );
    })
    .then(() => {
      if (res.headersSent) return;

      return db.query(
        `DELETE FROM categorias_aceptadas
         WHERE id_publicacion_intercambio = ?`,
        [idPublicacion],
      );
    })
    .then(() => {
      if (res.headersSent) return;

      if (categorias.length === 0) {
        res.json({
          mensaje: "Publicación de intercambio modificada correctamente",
        });
        return;
      }

      const valores = categorias.map((id) => [id, idPublicacion]);

      return db
        .query(
          `INSERT INTO categorias_aceptadas
         (id_categoria, id_publicacion_intercambio)
         VALUES ?`,
          [valores],
        )
        .then(() => {
          res.json({
            mensaje: "Publicación de intercambio modificada correctamente",
          });
        });
    })
    .catch((error) => {
      console.error("Error al modificar publicación de intercambio:", error);

      if (!res.headersSent) {
        res.status(500).json({
          mensaje: "Error al modificar la publicación",
        });
      }
    });
});

// ELIMINAR PUBLICACIÓN DE INTERCAMBIO

router.delete("/:id", (req, res) => {
  const idUsuario = req.user.id;
  const idPublicacion = req.params.id;

  db.query(
    `SELECT pi.Id_publicacion_intercambio
     FROM publicaciones_intercambio pi
     INNER JOIN prendas p ON pi.id_prenda = p.id_prenda
     WHERE pi.Id_publicacion_intercambio = ?
     AND p.Id_usuario = ?`,
    [idPublicacion, idUsuario],
  )
    .then(([publicaciones]) => {
      if (publicaciones.length === 0) {
        res.status(404).json({
          mensaje: "No se encontró la publicación",
        });
        return;
      }

      return db.query(
        `DELETE FROM categorias_aceptadas
         WHERE id_publicacion_intercambio = ?`,
        [idPublicacion],
      );
    })
    .then(() => {
      if (res.headersSent) return;

      return db.query(
        `DELETE FROM publicaciones_intercambio
         WHERE Id_publicacion_intercambio = ?`,
        [idPublicacion],
      );
    })
    .then(() => {
      if (res.headersSent) return;

      res.json({
        mensaje: "Publicación de intercambio eliminada correctamente",
      });
    })
    .catch((error) => {
      console.error("Error al eliminar publicación de intercambio:", error);

      if (!res.headersSent) {
        res.status(500).json({
          mensaje: "Error al eliminar la publicación",
        });
      }
    });
});

module.exports = router;
