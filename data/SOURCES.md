# Food catalogue and initial goals

## Source and conversion

The catalogue is derived from the Brazilian Food Composition Table — Tabela Brasileira de Composição de Alimentos (TACO), NEPA / Universidade Estadual de Campinas, revised and expanded 4th edition, Campinas, 2011.

- [Official spreadsheet](https://nepa.unicamp.br/wp-content/uploads/sites/27/2023/10/Taco-4a-Edicao.xlsx).
- [Official publication page](https://nepa.unicamp.br/publicacoes/).
- [Official PDF](https://nepa.unicamp.br/wp-content/uploads/sites/27/2023/10/taco_4_edicao_ampliada_e_revisada.pdf).

The opening pages of the PDF permit partial or complete reproduction with attribution. Values were extracted from the food-composition spreadsheet: energy in column D, protein in F, lipids in G and carbohydrates in I, all per 100 g of edible food.

The catalogue contains 578 foods with the four required values. `Tr` (trace) contributes zero to the sum while its original trace flag is retained. Missing values, asterisks and `NA` are not treated as zero: a food is omitted if any required value is unavailable. Each entry retains its source and year. Current branded products can be added from their nutrition labels.

## English names and prepared dishes

Food names, preparation descriptions, categories and serving labels are translated into English in this release. These are editorial translations, not an official English TACO edition. Stable food identifiers, nutrition values, trace flags and serving weights are unchanged by translation.

Regional prepared dishes retain recognisable names with English descriptions, such as **Feijoada (Brazilian black bean stew)** and **Acaraje (black-eyed pea fritter)**. Varieties and regional fish names are retained where a more specific English species name cannot be established reliably. The catalogue describes prepared foods and their composition; it does not provide cooking instructions or recalculate recipes from ingredients.

The earlier extracted label for item 540 was malformed (`L`). It is corrected to Feijoada after checking item 540 in the official PDF. Its identifier (`taco-540`) and nutrition values remain unchanged.

## Serving weights

Convenience weights for eggs, bananas, toast and custom units are module estimates, rather than household measures extracted from TACO. Labels identify built-in estimates as approximate. Users can correct grams per unit or enter a measured weight. Match the preparation and edible portion to the chosen food; brand and portion size can differ substantially.

## Initial profile and calculations

The distribution's default profile is a numerical example with a generic name: male, age 23, weight 70 kg and height 179 cm. `estimate()` applies Mifflin–St Jeor, giving 1,708.75 kcal resting energy, then multiplies by an assumed activity factor of 1.5, adds 100 kcal and rounds to 2,650 kcal.

These values demonstrate the implemented calculation; they are not a personalised recommendation for everyone installing the module. Target weight and the desired time frame are informational fields, not inputs to the formula. Goals are editable in the interface. The initial profile is defined in `diet-core.js` and copied only when a new diary is created.

[Mifflin et al., 1990](https://pubmed.ncbi.nlm.nih.gov/2305711/) describes the resting-energy equation used for this example.

In the example, protein is weight multiplied by 2, fat is fixed at 75 g, carbohydrates use the approximate remaining energy, and water is fixed at 2,500 ml. The code does not estimate individual hydration requirements, training intensity or supplementation. The ISSN reference informed the original example's protein parameter, rather than a prescription by the application.

[Jäger et al., ISSN, 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/).
