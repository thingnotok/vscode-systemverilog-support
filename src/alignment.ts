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
  let recontruct = processTxt(text);
  editor.edit((editBuilder) => {
    editBuilder.replace(range, recontruct);
  });
}


function processTxt(data){
  let declarations = register_statement(data);
  let recontruct = format_statement(declarations);
  return recontruct;
}

function register_statement(src_str){
  let dec = [];
  let left = [];
  var dtype_re = /((reg|wire|logic|integer|bit|byte|shortint|int|longint|time|shortreal|real|double|realtime|assign)  *(signed)* *)/;
  var vector_re = /(\[[^:]*:[^:]*\])*/;
  var array_re = /(\[[^:]*:[^:]*\])+/g;
  var comment_re = /\/\/.*/;
  var rval_re = /=.*;/;
  let statements = src_str.split("\n");
  statements.forEach(function(statement) {
    if (statement.search(dtype_re) !== -1) {
      let dtype = '', vector = '', inst_name = '', array = '',  comment = '', rval = '';
      // get dtype
      let statement_obj = {str : statement};
      dtype = get_state_field(statement_obj, dtype_re);
      vector = get_state_field(statement_obj, vector_re);
      array = get_state_field(statement_obj, array_re);
      comment = get_state_field(statement_obj, comment_re);
      rval = get_state_field(statement_obj, rval_re).replace(/[\s|;]*/g,'');
      inst_name = statement_obj.str.replace(/[\s|;]*/g,'');
      dec.push({dtype:dtype, vector:vector, inst_name:inst_name, array:array, comment:comment, rval:rval});
    }
    else {
      left.push(statement + ';');
    }
  }, this);
  return dec;
}

function get_state_field(s_obj, regx){
  let field = '';
  let field_t = s_obj.str.match(regx);
  if(field_t){
    field = field_t[0].trim();
    s_obj.str = s_obj.str.replace(regx, '');
  }
  return field;
}


function format_statement(declarations){
  let recontruct = '';
  let field_pos = get_pos(declarations);
  declarations.forEach(function(s) {
    let pre_ary = '';
    pre_ary += `${s.dtype}${' '.repeat(field_pos.d_pos - s.dtype.length+1)}`;
    pre_ary += `${s.vector}${' '.repeat(field_pos.v_pos - s.vector.length+1)}`;
    pre_ary += `${s.inst_name}${' '.repeat(field_pos.i_pos - s.inst_name.length+1)}`;
    pre_ary += `${s.array}${' '.repeat(field_pos.a_pos - s.array.length+1)}`;
    pre_ary += `${s.rval}${' '.repeat(field_pos.r_pos - s.rval.length+1)};`;
    pre_ary += `${s.comment}\n`;
    recontruct += pre_ary;
  }, this)
  return recontruct;
}

function get_pos(dec){
  let f = {
    d_pos : 0,
    i_pos : 0,
    r_pos : 0,
    v_pos : 0,
    a_pos : 0
  };
  dec.forEach(function(s){
    f.d_pos = get_max(s.dtype.length, f.d_pos);
    f.i_pos = get_max(s.inst_name.length, f.i_pos);
    f.r_pos = get_max(s.rval.length, f.r_pos);
    f.v_pos = get_max(s.vector.length, f.v_pos);
    f.a_pos = get_max(s.array.length, f.a_pos);
  }, this)
  return f;
}

function get_max(a, b){
  return a > b ? a : b;
}