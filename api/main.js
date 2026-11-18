
const router = require("express").Router();

const middlewareSeg = require("./middlewares/middlewareSeg");
const middlewareRol = require("./middlewares/middlewareRol");

const compraRouter = require("./publicaciones/publicaciones_compra_main");
const intercambioRouter = require("./publicaciones/publicaciones_intercambio_main");
const filtrosRouter = require("./filtros/filtros_main");
const pedidoRouter = require("./pedidos/pedidos_main");

const prendasRouter = require("./prendas/prendas_main");
const outfitsRouter = require("./outfits/outfits_main");

const categoriasRouter = require("./categorias/categorias_main");

const loginRouter = require("./auth/login");
const registroRouter = require("./auth/registro");

router.use("/login", loginRouter);
router.use("/registro", registroRouter);

router.use("/prendas", prendasRouter);
router.use("/categorias", categoriasRouter);
router.use("/outfits", outfitsRouter);

router.use("/publicaciones/compra", compraRouter);
router.use("/publicaciones/intercambio", intercambioRouter);
router.use("/filtros", filtrosRouter);
router.use("/pedidos", pedidoRouter);

module.exports = router;
