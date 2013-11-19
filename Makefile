spec:
	@./node_modules/mocha/bin/mocha -u bdd --reporter spec
test:
	@./node_modules/mocha/bin/mocha -u bdd --reporter list


.PHONY: test

