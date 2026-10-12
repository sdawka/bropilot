export const meta = { id: "meta", version: "1", source: `
% meta@1 - form validity of a template: is it a coherent ontology whose constraints can be satisfied?

.decl templateRef(Ref: sym)
.decl kind(Kind: sym)
.decl kindField(Kind: sym, Field: sym, Type: sym, Required: bool)
.decl kindParent(Kind: sym, Parent: sym)
.decl requiredField(Kind: sym, Field: sym)
.decl requiredChild(Kind: sym, Child: sym, Min: num, Max: num)
.decl requiredRel(Kind: sym, Rel: sym, Min: num, Max: num)
.decl relation(Rel: sym)
.decl relEndpoint(Rel: sym, Side: sym, Kind: sym)
.decl relInverse(Rel: sym, Inverse: sym)
.decl forbiddenCycle(Id: sym, Rel: sym)
.decl incompatible(Id: sym, Kind: sym, Field: sym, Value: sym)
.decl exclusive(Id: sym, Rel: sym)
.decl exactlyOne(Id: sym, Kind: sym, MemberType: sym, Member: sym)
.decl completeScope(Id: sym, Kind: sym)
.decl criterion(Id: sym, Owner: sym, Subject: sym, Severity: sym)
.decl extends(From: sym, To: sym)
.decl templateKnown(Ref: sym)
.decl templateNode(Id: sym, Kind: sym)
.decl templateNodeLink(Id: sym, Rel: sym)
.decl packError(Pack: sym, Kind: sym, Detail: sym)
.decl packRead(Key: sym, Pack: sym, Rel: sym)
.decl packDerives(Rel: sym)
.decl edbRelation(Rel: sym)
.decl questionPolicy(Question: sym, Answer: sym, Level: sym)
.decl questionSliceKind(Question: sym, Kind: sym)
.decl questionSliceRel(Question: sym, Rel: sym)
.decl findingLevel(Level: sym)
.decl fieldDeclared(Kind: sym, Field: sym)
.decl parentConstrained(Kind: sym)
.decl extendsReach(X: sym, Y: sym)
.decl violation(Rule: sym, Subject: sym, Severity: sym) .output

.message "relation.endpointUnknown" "Relation {1} names an endpoint kind the template does not declare."
.message "relation.inverseUnknown" "Relation {1} names an inverse relation the template does not declare."
.message "kind.parentUnknown" "Kind {1} allows a parent kind the template does not declare."
.message "kind.fieldUnknown" "Kind {1} requires a field it does not declare."
.message "kind.childUnknown" "Kind {1} requires children of a kind the template does not declare."
.message "kind.childUnsatisfiable" "Kind {1} requires children of a kind that may not be contained in it."
.message "kind.relationUnknown" "Kind {1} requires a relation the template does not declare."
.message "kind.relationUnsatisfiable" "Kind {1} requires a relation whose vocabulary does not allow it as a source."
.message "constraint.relationUnknown" "Constraint {1} names a relation the template does not declare."
.message "constraint.kindUnknown" "Constraint {1} names a kind the template does not declare."
.message "constraint.fieldUnknown" "Constraint {1} names a field its kind does not declare."
.message "template.extendsUnknown" "Template {1} extends a template that cannot be resolved."
.message "template.extendsCycle" "Template {1} is part of an extends cycle."
.message "rules.parse" "Rule pack {1} does not parse."
.message "rules.stratify" "Rule pack {1} does not stratify."
.message "rules.unknownRelation" "Rule pack read {1} names a relation that is neither emitted by the engine nor derived by the template."
.message "criterion.subjectKindUnknown" "Criterion {1} subjects a kind the template does not declare."
.message "question.levelUnknown" "Question {1} maps an answer to an unknown finding level."
.message "question.sliceKindUnknown" "Question {1} slices a kind the template does not declare."
.message "question.sliceRelationUnknown" "Question {1} slices along a relation the template does not declare."
.message "node.kindUnknown" "Prefilled node {1} has a kind the template does not declare."
.message "node.relationUnknown" "Prefilled node {1} has a link whose relation the template does not declare."

fieldDeclared(K,F) :- kindField(K,F,_,_).
parentConstrained(K) :- kindParent(K,_).
extendsReach(X,Y) :- extends(X,Y).
extendsReach(X,Z) :- extends(X,Y), extendsReach(Y,Z).

violation("relation.endpointUnknown",R,"hard") :- relEndpoint(R,_,K), not kind(K).
violation("relation.inverseUnknown",R,"hard") :- relInverse(R,I), not relation(I).
violation("kind.parentUnknown",K,"hard") :- kindParent(K,P), not kind(P).
violation("kind.fieldUnknown",K,"hard") :- requiredField(K,F), not fieldDeclared(K,F).
violation("kind.childUnknown",K,"hard") :- requiredChild(K,C,_,_), not kind(C).
violation("kind.childUnsatisfiable",K,"hard") :- requiredChild(K,C,Min,_), Min > 0, parentConstrained(C), not kindParent(C,K).
violation("kind.relationUnknown",K,"hard") :- requiredRel(K,R,_,_), not relation(R).
violation("kind.relationUnsatisfiable",K,"hard") :- requiredRel(K,R,Min,_), Min > 0, relation(R), not relEndpoint(R,"from",K).

violation("constraint.relationUnknown",C,"hard") :- forbiddenCycle(C,R), not relation(R).
violation("constraint.relationUnknown",C,"hard") :- exclusive(C,R), not relation(R).
violation("constraint.relationUnknown",C,"hard") :- exactlyOne(C,_,"rel",R), not relation(R).
violation("constraint.kindUnknown",C,"hard") :- incompatible(C,K,_,_), not kind(K).
violation("constraint.kindUnknown",C,"hard") :- exactlyOne(C,K,_,_), not kind(K).
violation("constraint.kindUnknown",C,"hard") :- completeScope(C,K), not kind(K).
violation("constraint.fieldUnknown",C,"hard") :- incompatible(C,K,F,_), kind(K), not fieldDeclared(K,F).
violation("constraint.fieldUnknown",C,"hard") :- exactlyOne(C,K,"field",F), kind(K), not fieldDeclared(K,F).

violation("template.extendsUnknown",T,"hard") :- extends(T,P), not templateKnown(P).
violation("template.extendsCycle",T,"hard") :- extendsReach(T,T).

violation("rules.parse",P,"hard") :- packError(P,"parse",_).
violation("rules.stratify",P,"hard") :- packError(P,"stratify",_).
violation("rules.unknownRelation",Key,"hard") :- packRead(Key,_,R), not edbRelation(R), not packDerives(R).

violation("criterion.subjectKindUnknown",C,"hard") :- criterion(C,_,K,_), not kind(K).
violation("question.levelUnknown",Q,"hard") :- questionPolicy(Q,_,L), not findingLevel(L).
violation("question.sliceKindUnknown",Q,"hard") :- questionSliceKind(Q,K), not kind(K).
violation("question.sliceRelationUnknown",Q,"hard") :- questionSliceRel(Q,R), not relation(R).
violation("node.kindUnknown",N,"hard") :- templateNode(N,K), not kind(K).
violation("node.relationUnknown",N,"hard") :- templateNodeLink(N,R), not relation(R).
` };
