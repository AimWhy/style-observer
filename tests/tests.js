export default [
	{
		name: "Interpolable built-in",
		arg: {
			property: "opacity",
			value: "0.5",
		},
		expect: "0.5",
	},
	{
		name: "Discrete built-in",
		arg: {
			property: "text-align",
			value: "center",
		},
		expect: "center",
	},
	{
		name: "Unregistered custom property",
		arg: {
			property: "--unregistered",
			initial: "bar",
			value: "foo",
		},
		expect: "foo",
	},
	{
		name: "Registered custom property",
		arg: {
			property: "--registered",
			meta: {
				syntax: "<angle>",
				initialValue: "0deg",
			},
			value: "1turn",
		},
		expect: "360deg",
	},
	{
		name: "The display property",
		tests: [
			{
				name: "To display: none",
				arg: {
					property: "display",
					value: "none",
				},
				expect: "none",
			},
			{
				name: "From display: none",
				arg: {
					property: "display",
					initial: "none",
					value: "block",
				},
				expect: "block",
			},
			{
				name: "display: from not none to not none",
				arg: {
					property: "display",
					initial: "grid",
					value: "flex",
				},
				expect: "flex",
			},
		],
	},
];
