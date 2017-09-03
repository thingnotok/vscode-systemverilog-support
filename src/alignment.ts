import * as vscode from 'vscode';



export function alignment(){
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
      return;
  }
  const selections = editor.selections;
  let selection = selections[0];
  let range = new vscode.Range(selection.start.line, 0, selection.end.character > 0 ? selection.end.line : selection.end.line - 1, 1024);
  let text = editor.document.getText(range);
  let recontruct = test_new(text);
  
  editor.edit((editBuilder) => {
    editBuilder.replace(range, recontruct);
  });
}

const declaration_regformat = [
  /\/\/.*/, //line comment
  /((reg|wire|logic|integer|bit|byte|shortint|int|longint|time|shortreal|real|double|realtime|assign)  *(signed)* *)/, //data_type
  /((<=.*)|(=.*);)|;/,  //assignment
  /(\[[^:]*:[^:]*\])+/, //vector
  /(\[[^:]*:[^:]*\])+/, //array
  /.*/, // variable (/wo assignment)
];
const dec_or_assign = /(((reg|wire|logic|integer|bit|byte|shortint|int|longint|time|shortreal|real|double|realtime|assign)  *(signed)* *))|((<=.*)|(=.*))/;



function test_new(data){
  let v1 = split_statements(data, '\n');
  let ident = get_ident(v1, dec_or_assign);
  let v2 = decs_handle(v1); // split a statement into fields and do inner-field prealignment
  let v3 = dec_format(v2, ident); // format the statements
  return v3;
}



const dec_format = function(declarations_infield, ident){
  let anchors = get_anchors(declarations_infield, declaration_regformat.length);
  let recontructs = [];
  declarations_infield.forEach(function(dec){
    recontructs.push(format(dec, anchors, ident))
  },this);
  let r_text = '';
  recontructs.forEach(function(rec){
    r_text += rec + '\n';
  },this);
  return r_text.slice(0, -1);
}

const decs_handle = function (declarations){
  let decs_r = [];
  declarations.forEach(function f(declaration){
    decs_r.push(dec_split(declaration));
  },this);
  
  // dec     [mask, dtype, vec, variable, array, assignment]
  decs_r = dec_align_vec(decs_r, 2); // align vector
  decs_r = dec_align_vec(decs_r, 4); // align array
  decs_r = dec_align_assignment(decs_r, 5); // align assignment

  return decs_r;
}

const dec_split = function(declaration) {
  if(check_type(declaration, dec_or_assign)) {// split into list of declaration field
    let dec = split_into_fields(declaration, declaration_regformat);
    // dec_reg [flag, comment, data_type, assignment, vector, array, variable] 
    let dec_arrange = [dec[0], dec[2], dec[4], dec[6], dec[5], dec[3], dec[1]];
    return dec_arrange;
  }
  else // unchange and marked as don't touch
    return ['0', declaration];
};


function dec_align_assignment(declarations, assign_idx){
  let rval_max = 0;
  declarations.forEach(function(dec){
    if(dec[0] == '1'){
      if(dec[assign_idx].search(/(=)/) !== -1){ // is assignment
        dec[assign_idx] = dec[assign_idx].replace(/([\+\-\*]{1,2}|\/)/g,  ' $1 ');
        dec[assign_idx] = dec[assign_idx].replace(/(,)/g,  '$1 ');
        if(dec[assign_idx].search(/<=/) !== -1){
          dec[assign_idx] = dec[assign_idx].slice(2, dec[assign_idx].length-1).trim();
          rval_max = dec[assign_idx].length > rval_max ? dec[assign_idx].length : rval_max;
          dec[assign_idx] = '<= '+ dec[assign_idx];
        }
        else {
          dec[assign_idx] = dec[assign_idx].slice(1, dec[assign_idx].length-1).trim();
          rval_max = dec[assign_idx].length > rval_max ? dec[assign_idx].length : rval_max;
          dec[assign_idx] = '= '+ dec[assign_idx];
        }
      }
      else {
        dec[assign_idx] = '';
      }
    }
  },this);
  rval_max += 2;
  declarations.forEach(function(dec){
    if(dec[0] == '1'){
      if(dec[assign_idx].search(/<=/) !== -1)
        dec[assign_idx] = dec[assign_idx] + ' '.repeat(rval_max+1 - dec[assign_idx].length) + ';';
      else
        dec[assign_idx] = dec[assign_idx] + ' '.repeat(rval_max - dec[assign_idx].length) + ';';
    }
  },this);
  return declarations;
}

function dec_align_vec(declarations, vec_field_idx){
  let rval_max = [];
  declarations.forEach(function(dec){
    if(dec[0] == '1'){
      if(dec[vec_field_idx].length > 0 && dec[vec_field_idx].search(/\[/) !== -1){ // has vector
        dec[0] = '2';
        let vec_ary = dec[vec_field_idx].split(/[\[\]:]/)
        vec_ary.pop();
        let idx = 0;
        dec[vec_field_idx] = cleanArray(vec_ary);
        dec[vec_field_idx].forEach(function(vec){
          if(idx<rval_max.length)
            rval_max[idx] = rval_max[idx] > vec.length ? rval_max[idx] : vec.length;
          else
            rval_max.push(vec.length);
          idx++;
        }, this);
      }
    }
  },this);
  declarations.forEach(function(dec){
    if(dec[0] == '2'){
      dec[0] = '1';
      let idx = 0;
      let restruc = '';
      dec[vec_field_idx].forEach(function(vec_w){
        if(idx%2 == 0)
          restruc += '[';
        restruc += ' '.repeat(rval_max[idx] - vec_w.length) + vec_w;
        if(idx%2 == 0)
          restruc += ':';
        else
          restruc += ']';
        idx++;
      }, this);
      dec[vec_field_idx] = restruc;
    }
  },this);
  
  return declarations;
}

function get_ident(declarations, type){
  let ident = '';
  for(let i=0; i<declarations.length;i++){
    if(check_type(declarations[i], type)) {// split into list of declaration field
      ident = declarations[i].match(/\s*/); // get ident from first statement
      break;
    }
  }
  return ident;
}

function format(statement_infield, anchors, ident){
  let recontruct = '';
  if(statement_infield[0]=='1'){
    recontruct += ident;
    for(let i=1; i<anchors.length;i++)
      recontruct += `${statement_infield[i]}${' '.repeat(anchors[i] - statement_infield[i].length)}`;
  }
  else
    recontruct+= statement_infield[1];
  return recontruct;
}
function split_statements(text, split_point){
  return text.split("\n");
}
function check_type(statement, type_identifier){
  if(statement.search(type_identifier) !== -1)
    return true;
  else
    return false;
}

function split_into_fields(statement, fields){
  let format_list = ['1'];
  let statement_obj = {str : statement};
  format_list.push(get_state_field(statement_obj, fields[0])); //comment
  format_list.push(get_state_field(statement_obj, fields[1])); // assignment
  format_list.push(get_state_field(statement_obj, fields[2])); // dtype
  if(format_list[2]  == 'assign' || format_list[2] == ""){ //pure assignment
    format_list.push(""); //no vector
    format_list.push(""); //no array
  }
  else{
    format_list.push(get_state_field(statement_obj, fields[3])); // vector
    format_list.push(get_state_field(statement_obj, fields[4])); // array
  }
  format_list.push(get_state_field(statement_obj, fields[5]).replace(/(,)/g,  '$1 ')); // l_value or variable
  return format_list;
}
function get_anchors(statements_infield, num_of_anchors){
  let anchors = [];
  for(let i=0;i<num_of_anchors+1;i++)
    anchors.push(0);
  statements_infield.forEach(function(statement){
    if(statement[0] == '0')
      return;
    else
      for(let i = 1; i<num_of_anchors+1;i++)
        if(anchors[i]<statement[i].length)
          anchors[i] = statement[i].length;
  },this);
  for(let i = 0; i< anchors.length; i++){
    anchors[i] += anchors[i] > 0 ? 1 : 0;
  };
  return anchors;
}

function get_state_field(s_obj, regx){
  let field = '';
  let field_t = s_obj.str.match(regx);
  if(field_t){
    field = field_t[0].replace(/\s/g, '');
    s_obj.str = s_obj.str.replace(regx, '');
  }
  return field;
}
function get_max(a, b){
  return a > b ? a : b;
}

function cleanArray(actual) {
  var newArray = new Array();
  for (var i = 0; i < actual.length; i++) {
    if (actual[i]) {
      newArray.push(actual[i]);
    }
  }
  return newArray;
}