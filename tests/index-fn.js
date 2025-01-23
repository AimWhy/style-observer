let tests = await Promise.all([
	"basic",
	"multiple",
].map(name => import(`./${name}.js`).then(module => module.default)));


export default {
	name: "All StyleObserver tests",
	tests,
};
