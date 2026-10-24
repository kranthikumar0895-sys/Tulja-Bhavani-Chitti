import pandas as pd
from datetime import datetime

months = 24
output_file = f"Chitti_Interactive_{datetime.now().year}.xlsx"
chittis = {
    "1 Lakh Chitti": 100000,
    "2 Lakh Chitti": 200000,
    "5 Lakh Chitti": 500000
}

def generate_chitti_data(chitti_name, amount, members):
    monthly_value = amount / months
    rows = []
    for member in members:
        for m in range(1, months+1):
            excel_row = len(rows) + 2
            rows.append([
                member,
                chitti_name,
                m,
                monthly_value,
                f"=D{excel_row}*0.05",           # Commission
                f"=D{excel_row}-E{excel_row}",   # Amount
                "",                              # Custom (editable)
                f"=IF(ISBLANK(G{excel_row}),E{excel_row}+F{excel_row},E{excel_row}+F{excel_row}+G{excel_row})"
            ])
    return pd.DataFrame(rows, columns=["Name","Chitti","Month","Value","Commission","Amount","Custom","Payable"])

with pd.ExcelWriter(output_file, engine="xlsxwriter") as writer:
    for chitti_name, amount in chittis.items():
        members = [f"Person{i}" for i in range(1,21)]
        df = generate_chitti_data(chitti_name, amount, members)
        df.to_excel(writer, sheet_name=chitti_name, index=False)

print(f"Excel file created: {output_file} (3 sheets, each with 20 members × {months} months)")
